import Foundation
import Synchronization
import Testing
@testable import SystemDesignQuest

/// 假的 `/v1/auth` 服务：记录请求，按序返回预设响应。
private final class FakeAuth: @unchecked Sendable {
    struct Reply { var status = 200; var json: String }
    private let state = Mutex<(replies: [Reply], requests: [URLRequest], calls: Int)>(([], [], 0))
    var error: URLError?

    init(_ replies: [Reply]) { state.withLock { $0.replies = replies } }

    var requests: [URLRequest] { state.withLock { $0.requests } }
    var calls: Int { state.withLock { $0.calls } }

    var transport: VideoAuthTransport {
        { request in
            if let error = self.error { throw error }
            let reply = self.state.withLock { s -> Reply in
                s.requests.append(request)
                let r = s.replies[min(s.calls, s.replies.count - 1)]
                s.calls += 1
                return r
            }
            let http = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: nil)!
            return (Data(reply.json.utf8), http)
        }
    }

    static func ok(_ token: String, lang: String = "zh", ttl: Int = 900) -> Reply {
        Reply(json: #"{"ok":true,"token":"\#(token)","expiresAt":1790000900,"ttlSeconds":\#(ttl),"pathPrefix":"/v1/\#(lang)/"}"#)
    }
    static func fail(_ status: Int, _ code: String) -> Reply {
        Reply(status: status, json: #"{"ok":false,"error":{"code":"\#(code)","message":"x"}}"#)
    }
}

private final class Clock: @unchecked Sendable {
    private let t = Mutex(Date(timeIntervalSince1970: 1_790_000_000))
    var now: Date { t.withLock { $0 } }
    func advance(_ seconds: TimeInterval) { t.withLock { $0 = $0.addingTimeInterval(seconds) } }
}

private let base = URL(string: "https://video.test/")!

private func makeProvider(_ fake: FakeAuth, clock: Clock = Clock(), jws: String? = "JWS-1") -> AuthorizedVideoURLProvider {
    let client = VideoAuthClient(endpoint: { base.appendingPathComponent("v1").appendingPathComponent("auth") },
                                 signedTransaction: { jws }, transport: fake.transport, now: { clock.now })
    return AuthorizedVideoURLProvider(
        base: DirectVideoURLProvider(version: "v1", config: { VideoConfig(cnBase: base, globalBase: base) }, region: { .overseas }),
        isFree: { $0 == 1 },
        tokens: VideoTokenStore(now: { clock.now }, fetch: { try await client.fetchToken(language: $0) }))
}

@Suite("视频鉴权")
struct VideoAuthTests {
    @Test func 付费章节请求auth并带上token() async throws {
        let fake = FakeAuth([FakeAuth.ok("tok1")])
        let url = try await makeProvider(fake).playableURL(chapter: 2, language: .zh)
        #expect(url.absoluteString == "https://video.test/v1/zh/ch02.mp4?token=tok1")
        let request = try #require(fake.requests.first)
        #expect(request.url?.absoluteString == "https://video.test/v1/auth")
        #expect(request.httpMethod == "POST")
        #expect(request.timeoutInterval == 15)
        let data = try #require(request.httpBody)
        let body = try #require(JSONSerialization.jsonObject(with: data) as? [String: String])
        #expect(body == ["signedTransaction": "JWS-1", "lang": "zh"])
    }

    @Test func 免费章节不请求auth也不带token() async throws {
        let fake = FakeAuth([FakeAuth.ok("tok1")])
        let url = try await makeProvider(fake, jws: nil).playableURL(chapter: 1, language: .zh)
        #expect(url.absoluteString == "https://video.test/v1/zh/ch01.mp4")
        #expect(fake.calls == 0)
    }

    @Test func token在有效期内复用_临近过期重取() async throws {
        let clock = Clock()
        let fake = FakeAuth([FakeAuth.ok("tok1"), FakeAuth.ok("tok2")])
        let provider = makeProvider(fake, clock: clock)
        _ = try await provider.playableURL(chapter: 2, language: .zh)
        clock.advance(600)
        let second = try await provider.playableURL(chapter: 3, language: .zh)
        #expect(second.query == "token=tok1")
        #expect(fake.calls == 1)
        clock.advance(260) // 距过期不足 60 秒
        let third = try await provider.playableURL(chapter: 2, language: .zh)
        #expect(third.query == "token=tok2")
        #expect(fake.calls == 2)
    }

    @Test func 不同语言分别取token() async throws {
        let fake = FakeAuth([FakeAuth.ok("zhTok"), FakeAuth.ok("enTok", lang: "en")])
        let provider = makeProvider(fake)
        #expect(try await provider.playableURL(chapter: 2, language: .zh).query == "token=zhTok")
        #expect(try await provider.playableURL(chapter: 2, language: .en).query == "token=enTok")
        #expect(try await provider.playableURL(chapter: 5, language: .zh).query == "token=zhTok")
        #expect(fake.calls == 2)
    }

    @Test func 刷新会丢弃旧token() async throws {
        let fake = FakeAuth([FakeAuth.ok("tok1"), FakeAuth.ok("tok2")])
        let provider = makeProvider(fake)
        _ = try await provider.playableURL(chapter: 2, language: .zh)
        let refreshed = try await provider.refreshedURL(chapter: 2, language: .zh)
        #expect(refreshed.query == "token=tok2")
    }

    @Test func 并发请求共用一次auth() async throws {
        let fake = FakeAuth([FakeAuth.ok("tok1")])
        let provider = makeProvider(fake)
        let urls = try await withThrowingTaskGroup(of: URL.self) { group in
            for chapter in 2...6 { group.addTask { try await provider.playableURL(chapter: chapter, language: .zh) } }
            return try await group.reduce(into: []) { $0.append($1) }
        }
        #expect(urls.count == 5)
        #expect(fake.calls == 1)
    }

    @Test func 没有购买凭证() async {
        let fake = FakeAuth([FakeAuth.ok("tok1")])
        await #expect(throws: VideoURLError.noPurchase) { try await makeProvider(fake, jws: nil).playableURL(chapter: 2, language: .zh) }
        #expect(fake.calls == 0)
    }

    @Test func 网络错误映射() async {
        let fake = FakeAuth([FakeAuth.ok("tok1")])
        fake.error = URLError(.timedOut)
        await #expect(throws: VideoURLError.network) { try await makeProvider(fake).playableURL(chapter: 2, language: .zh) }
    }

    @Test func 服务端拒绝与异常映射() async {
        await #expect(throws: VideoURLError.rejected("REVOKED")) {
            try await makeProvider(FakeAuth([FakeAuth.fail(403, "REVOKED")])).playableURL(chapter: 2, language: .zh)
        }
        await #expect(throws: VideoURLError.rejected("BAD_CHAIN")) {
            try await makeProvider(FakeAuth([FakeAuth.fail(401, "BAD_CHAIN")])).playableURL(chapter: 2, language: .zh)
        }
        await #expect(throws: VideoURLError.serverError(429)) {
            try await makeProvider(FakeAuth([FakeAuth.fail(429, "RATE_LIMITED")])).playableURL(chapter: 2, language: .zh)
        }
        await #expect(throws: VideoURLError.serverError(500)) {
            try await makeProvider(FakeAuth([Reply500])).playableURL(chapter: 2, language: .zh)
        }
        await #expect(throws: VideoURLError.serverError(200)) {
            try await makeProvider(FakeAuth([.init(json: "not json")])).playableURL(chapter: 2, language: .zh)
        }
    }

    @Test func 失败不会缓存_下次重试() async throws {
        let fake = FakeAuth([FakeAuth.fail(500, "MISCONFIGURED"), FakeAuth.ok("tok1")])
        let provider = makeProvider(fake)
        await #expect(throws: VideoURLError.self) { try await provider.playableURL(chapter: 2, language: .zh) }
        #expect(try await provider.playableURL(chapter: 2, language: .zh).query == "token=tok1")
    }

    @Test func 缓存键不含token() {
        let asset = VideoAsset(chapter: 2, language: .zh, version: "v1",
                               info: VideoFile(file: "ch02.mp4", bytes: 1, sha256: "86a60009ff", durationSec: 1, bundled: false))
        #expect(asset.key == VideoKey(chapter: 2, language: .zh))
        #expect(asset.cacheFileName == "ch02-v1-86a60009.mp4")
    }

    @Test func 店面为大陆也走海外源() async {
        #expect(VideoRegion.mainlandRoutingEnabled == false)
        #expect(await VideoRegion.resolved() == .overseas)
        #expect(VideoRegion.from(countryCode: "CHN") == .mainlandChina)
    }

    @Test func 错误文案可区分() {
        let messages = [VideoURLError.noPurchase, .network, .rejected("x"), .serverError(500), .unavailable].map(\.userMessage)
        #expect(Set(messages).count == 5)
    }
}

private let Reply500 = FakeAuth.Reply(status: 500, json: "oops")
