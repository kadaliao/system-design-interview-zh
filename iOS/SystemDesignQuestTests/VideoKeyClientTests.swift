import Foundation
import Synchronization
import Testing
@testable import SystemDesignQuest

/// 假的 `/v1/key` 服务：记录请求，按序返回预设响应。
final class FakeKeyServer: @unchecked Sendable {
    struct Reply { var status = 200; var json: String }
    private let state = Mutex<(replies: [Reply], requests: [URLRequest], delay: Duration)>(([], [], .zero))
    var error: URLError?

    init(_ replies: [Reply]) { state.withLock { $0.replies = replies } }

    var requests: [URLRequest] { state.withLock { $0.requests } }
    func setDelay(_ d: Duration) { state.withLock { $0.delay = d } }

    var transport: VideoKeyTransport {
        { request in
            if let error = self.error { throw error }
            let (reply, delay) = self.state.withLock { s -> (Reply, Duration) in
                s.requests.append(request)
                return (s.replies[min(s.requests.count - 1, s.replies.count - 1)], s.delay)
            }
            if delay > .zero { try await Task.sleep(for: delay) }
            let http = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: nil)!
            return (Data(reply.json.utf8), http)
        }
    }
}

extension FakeKeyServer.Reply {
    static func ok(_ key: Data) -> Self {
        .init(json: #"{"ok":true,"key":"\#(key.base64EncodedString())","keyVersion":1}"#)
    }
    static func fail(_ status: Int, _ code: String) -> Self {
        .init(status: status, json: #"{"ok":false,"error":{"code":"\#(code)","message":"x"}}"#)
    }
}

private let key32 = Data((0..<32).map { UInt8($0) })

private func client(_ fake: FakeKeyServer, jws: String? = "JWS-1", timeout: TimeInterval = 15) -> VideoKeyClient {
    VideoKeyClient(endpoint: URL(string: "https://video.test/v1/key")!, signedTransaction: { jws },
                   transport: fake.transport, timeout: timeout)
}

@Suite("取内容密钥")
struct VideoKeyClientTests {
    @Test func 成功返回主密钥并发出规范的请求() async throws {
        let fake = FakeKeyServer([.ok(key32)])
        let key = try await client(fake).fetchMasterKey()
        #expect(key == key32)
        let request = try #require(fake.requests.first)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "https://video.test/v1/key")
        #expect(request.timeoutInterval == 15)
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        let body = try #require(request.httpBody)
        let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: String])
        #expect(json == ["signedTransaction": "JWS-1"])
    }

    @Test func 默认地址和超时() {
        #expect(VideoKeyClient.defaultEndpoint.absoluteString == "https://video.liaoxingyi.com/v1/key")
        #expect(VideoKeyClient().timeout == 15)
    }

    @Test func 没有购买凭证不发请求() async {
        let fake = FakeKeyServer([.ok(key32)])
        await #expect(throws: VideoKeyError.noPurchase) { try await client(fake, jws: nil).fetchMasterKey() }
        #expect(fake.requests.isEmpty)
    }

    @Test func 网络错误映射() async {
        let fake = FakeKeyServer([.ok(key32)])
        fake.error = URLError(.timedOut)
        await #expect(throws: VideoKeyError.network) { try await client(fake).fetchMasterKey() }
    }

    @Test func 取消不当作网络错误() async {
        let fake = FakeKeyServer([.ok(key32)])
        fake.error = URLError(.cancelled)
        await #expect(throws: CancellationError.self) { try await client(fake).fetchMasterKey() }
    }

    @Test(arguments: [400, 401, 403]) func 服务端拒绝映射为rejected(status: Int) async {
        let fake = FakeKeyServer([.fail(status, "REVOKED")])
        await #expect(throws: VideoKeyError.rejected("REVOKED")) { try await client(fake).fetchMasterKey() }
    }

    @Test func 拒绝但响应体无法解析时带状态码() async {
        let fake = FakeKeyServer([.init(status: 403, json: "<html>")])
        await #expect(throws: VideoKeyError.rejected("HTTP 403")) { try await client(fake).fetchMasterKey() }
    }

    @Test(arguments: [429, 500, 502]) func 限流和服务端异常映射为serverError(status: Int) async {
        let fake = FakeKeyServer([.fail(status, "X")])
        await #expect(throws: VideoKeyError.serverError(status)) { try await client(fake).fetchMasterKey() }
    }

    @Test func 响应格式不对按服务端异常处理() async {
        for json in [#"{"ok":true}"#, #"{"ok":false}"#, "nope", #"{"ok":true,"key":"!!!"}"#,
                     #"{"ok":true,"key":"\#(Data(count: 16).base64EncodedString())"}"#] {
            let fake = FakeKeyServer([.init(json: json)])
            await #expect(throws: VideoKeyError.serverError(200)) { try await client(fake).fetchMasterKey() }
        }
    }

    @Test func 每种错误都有可区分的用户文案() {
        let messages = [VideoKeyError.noPurchase, .network, .rejected("x"), .serverError(500)].map(\.userMessage)
        #expect(Set(messages).count == 4)
    }
}

@Suite("密钥获取协调")
struct VideoKeyProvisionerTests {
    @Test func 取到后存入Keychain_已有则不再请求() async throws {
        let tv = testVault()
        defer { tv.cleanup() }
        let fake = FakeKeyServer([.ok(key32)])
        let p = VideoKeyProvisioner(vault: tv.vault, client: client(fake))
        try await p.ensureKey()
        #expect(tv.vault.masterKey() == key32)
        try await p.ensureKey()
        #expect(fake.requests.count == 1)
    }

    @Test func 并发调用共用一次请求() async throws {
        let tv = testVault()
        defer { tv.cleanup() }
        let fake = FakeKeyServer([.ok(key32)])
        fake.setDelay(.milliseconds(200))
        let p = VideoKeyProvisioner(vault: tv.vault, client: client(fake))
        async let a: Void = p.ensureKey()
        async let b: Void = p.ensureKey()
        _ = try await (a, b)
        #expect(fake.requests.count == 1)
    }

    @Test func 失败不存密钥_静默获取不抛错_之后可重试() async throws {
        let tv = testVault()
        defer { tv.cleanup() }
        let fake = FakeKeyServer([.fail(500, "X"), .ok(key32)])
        let p = VideoKeyProvisioner(vault: tv.vault, client: client(fake))
        await p.provisionQuietly()
        #expect(!tv.vault.hasKey)
        await #expect(throws: Never.self) { try await p.ensureKey() }
        #expect(tv.vault.masterKey() == key32)
    }
}
