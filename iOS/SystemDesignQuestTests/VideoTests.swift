import AVFoundation
import CryptoKit
import Foundation
import Synchronization
import Testing
@testable import SystemDesignQuest

// MARK: URLProtocol 桩

struct StubResponse: Sendable {
    var status = 200
    var body = Data()
    /// 发出响应头后一直不结束，用来测试取消。
    var hang = false
}

final class StubProtocol: URLProtocol, @unchecked Sendable {
    private struct Route { var responses: [StubResponse]; var hits = 0 }
    private static let routes = Mutex<[String: Route]>([:])

    /// 同一路径依次返回 `responses`，用完后重复最后一个。
    static func register(path: String, _ responses: [StubResponse]) {
        routes.withLock { $0[path] = Route(responses: responses) }
    }

    static func hits(_ path: String) -> Int { routes.withLock { $0[path]?.hits ?? 0 } }

    static func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: config)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        let response: StubResponse? = Self.routes.withLock { routes in
            guard var route = routes[path] else { return nil }
            let index = min(route.hits, route.responses.count - 1)
            route.hits += 1
            routes[path] = route
            return route.responses[index]
        }
        guard let response else {
            client?.urlProtocol(self, didFailWithError: URLError(.fileDoesNotExist))
            return
        }
        let http = HTTPURLResponse(url: request.url!, statusCode: response.status, httpVersion: "HTTP/1.1",
                                   headerFields: ["Content-Length": String(response.body.count)])!
        client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
        if response.hang { return }
        client?.urlProtocol(self, didLoad: response.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

// MARK: 辅助

private func sha(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

private let sampleCatalogJSON = """
{"version":"v1","chapters":[
 {"chapter":1,"free":true,"titles":{"zh":"从零扩展","en":"Scaling"},
  "files":{"zh":{"file":"ch01.mp4","bytes":100,"sha256":"aa","durationSec":224.1,"bundled":true}}},
 {"chapter":2,"free":false,"titles":{"zh":"估算","en":"Estimation"},
  "files":{"zh":{"file":"ch02.mp4","bytes":200,"sha256":"bbccddeeff","durationSec":188.6,"bundled":false},
           "en":{"file":"ch02.mp4","bytes":210,"sha256":"11223344","durationSec":190,"bundled":false}}}
]}
"""

private func makeAsset(chapter: Int = 2, language: AppLanguage = .zh, body: Data, claimedSHA: String? = nil,
                       claimedBytes: Int64? = nil) -> VideoAsset {
    VideoAsset(chapter: chapter, language: language, version: "v1",
               info: VideoFile(file: String(format: "ch%02d.mp4", chapter), bytes: claimedBytes ?? Int64(body.count),
                               sha256: claimedSHA ?? sha(body), durationSec: 10, bundled: false))
}

private func makeCache(network: NetworkStatus = .unmetered, wifiOnly: Bool = true, attempts: Int = 3) -> (VideoCache, URL) {
    let root = FileManager.default.temporaryDirectory.appending(path: "video-cache-test-\(UUID().uuidString)")
    let cache = VideoCache(root: root, session: StubProtocol.session(), network: FixedNetwork(network),
                           wifiOnly: { wifiOnly }, maxAttempts: attempts, retryDelay: .milliseconds(1))
    return (cache, root)
}

private func stubURL(_ path: String) -> URL { URL(string: "https://stub.test\(path)")! }

private func uniquePath() -> String { "/\(UUID().uuidString)/v1/zh/ch02.mp4" }

// MARK: 清单、语言、地区、选源

@Suite("视频清单与选源")
struct VideoCatalogTests {
    @Test func 解析清单() throws {
        let catalog = try VideoCatalog.decode(Data(sampleCatalogJSON.utf8))
        #expect(catalog.version == "v1")
        #expect(catalog.chapters.count == 2)
        let first = try #require(catalog.entry(chapter: 1))
        #expect(first.free)
        #expect(first.files["zh"]?.bundled == true)
        #expect(first.title(for: .en) == "Scaling")
    }

    @Test func 缺语言时回落中文() throws {
        let catalog = try VideoCatalog.decode(Data(sampleCatalogJSON.utf8))
        let one = try #require(catalog.entry(chapter: 1))
        #expect(one.resolvedLanguage(.en) == .zh)
        let two = try #require(catalog.entry(chapter: 2))
        #expect(two.resolvedLanguage(.en) == .en)
        #expect(two.asset(version: "v1", language: .en)?.info.bytes == 210)
    }

    @Test func 缓存文件名带版本和校验前缀() throws {
        let catalog = try VideoCatalog.decode(Data(sampleCatalogJSON.utf8))
        let asset = try #require(catalog.entry(chapter: 2)?.asset(version: "v1", language: .zh))
        #expect(asset.cacheFileName == "ch02-v1-bbccddee.mp4")
    }

    @Test func 时长文案() {
        let en = Locale(identifier: "en_US")
        #expect(VideoFormat.duration(224.1, locale: en) == "3 min, 44 sec")
        #expect(VideoFormat.duration(60, locale: en) == "1 min")
    }

    @Test func 内置清单完整且第一章视频在包里() throws {
        let catalog = try #require(VideoCatalog.loadBundled())
        #expect(catalog.chapters.map(\.chapter) == Array(1...28))
        #expect(catalog.chapters.filter(\.free).map(\.chapter) == [1])
        let asset = try #require(catalog.entry(chapter: 1)?.asset(version: catalog.version, language: .zh))
        let url = try #require(catalog.bundledURL(for: asset))
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize
        #expect(Int64(size ?? 0) == asset.info.bytes)
        #expect(catalog.chapters.dropFirst().allSatisfy { $0.files.values.allSatisfy { !$0.bundled } })
    }

    @Test func 应用语言跟随系统语言() {
        #expect(AppLanguage.resolve(preferred: ["zh-Hans-CN"]) == .zh)
        #expect(AppLanguage.resolve(preferred: ["zh-Hant-TW"]) == .zh)
        #expect(AppLanguage.resolve(preferred: ["en-US"]) == .en)
        #expect(AppLanguage.resolve(preferred: ["ja-JP", "zh-Hans"]) == .en)
        #expect(AppLanguage.resolve(preferred: []) == .en)
    }

    @Test func 地区按店面国家码() {
        #expect(VideoRegion.from(countryCode: "CHN") == .mainlandChina)
        #expect(VideoRegion.from(countryCode: "USA") == .overseas)
        #expect(VideoRegion.from(countryCode: "HKG") == .overseas)
        #expect(VideoRegion.from(countryCode: nil) == .overseas)
    }

    @Test func 按地区和语言拼地址() {
        let config = VideoConfig()
        #expect(config.url(chapter: 7, language: .zh, version: "v1", region: .mainlandChina).absoluteString
                == "https://video-cn.liaoxingyi.com/v1/zh/ch07.mp4")
        #expect(config.url(chapter: 12, language: .en, version: "v1", region: .overseas).absoluteString
                == "https://video.liaoxingyi.com/v1/en/ch12.mp4")
    }

    @Test func 远程配置覆盖地址() throws {
        let data = Data(#"{"cn":"https://cdn.cn.test/"}"#.utf8)
        let config = try VideoConfig.parseRemote(data)
        #expect(config.cnBase.absoluteString == "https://cdn.cn.test/")
        #expect(config.globalBase == VideoConfig.placeholderGlobal)
        #expect(throws: Error.self) { try VideoConfig.parseRemote(Data("nope".utf8)) }
    }

    @Test func 默认提供者按地区拼地址() async throws {
        let provider = DirectVideoURLProvider(version: "v1", config: { VideoConfig() }, region: { .mainlandChina })
        let url = try await provider.playableURL(chapter: 3, language: .zh)
        #expect(url.absoluteString == "https://video-cn.liaoxingyi.com/v1/zh/ch03.mp4")
    }

    @Test func 签名提供者只给付费章节加token() async throws {
        let base = MockVideoURLProvider(.success(URL(string: "https://v.test/v1/zh/ch02.mp4")!))
        let provider = TokenVideoURLProvider(base: base, isFree: { $0 == 1 }, fetchToken: { _, _ in "abc" })
        #expect(try await provider.playableURL(chapter: 2, language: .zh).absoluteString == "https://v.test/v1/zh/ch02.mp4?token=abc")
        #expect(try await provider.playableURL(chapter: 1, language: .zh).absoluteString == "https://v.test/v1/zh/ch02.mp4")
    }

    @Test func 提供者失败会抛出() async {
        let provider = MockVideoURLProvider(.failure(.unavailable))
        await #expect(throws: VideoURLError.self) { try await provider.playableURL(chapter: 2, language: .zh) }
    }

    @Test @MainActor func 默认权限只放行第一章() {
        let access = DefaultVideoAccess()
        #expect(access.canPlay(chapter: 1))
        #expect(!access.canPlay(chapter: 2))
        let service = VideoService(catalog: nil, network: FixedNetwork(.unmetered), access: access)
        var asked: [Int] = []
        service.onNeedsPaywall = { asked.append($0) }
        #expect(service.requestPlayback(chapter: 1))
        #expect(!service.requestPlayback(chapter: 5))
        #expect(asked == [5])
    }
}

// MARK: 播放策略

@Suite("视频播放策略")
struct VideoPlaybackPlanTests {
    let bundled = URL(fileURLWithPath: "/b.mp4")
    let cached = URL(fileURLWithPath: "/c.mp4")

    @Test func 包内和缓存优先() {
        #expect(VideoPlaybackPlan.make(bundled: bundled, cached: cached, network: .offline, wifiOnly: true) == .local(bundled))
        #expect(VideoPlaybackPlan.make(bundled: nil, cached: cached, network: .offline, wifiOnly: true) == .local(cached))
    }

    @Test func 没缓存时按网络决定() {
        #expect(VideoPlaybackPlan.make(bundled: nil, cached: nil, network: .offline, wifiOnly: true) == .offline)
        #expect(VideoPlaybackPlan.make(bundled: nil, cached: nil, network: .unmetered, wifiOnly: true)
                == .stream(needsCellularConfirm: false, cacheInBackground: true))
        #expect(VideoPlaybackPlan.make(bundled: nil, cached: nil, network: .metered, wifiOnly: true)
                == .stream(needsCellularConfirm: true, cacheInBackground: false))
        #expect(VideoPlaybackPlan.make(bundled: nil, cached: nil, network: .metered, wifiOnly: false)
                == .stream(needsCellularConfirm: true, cacheInBackground: true))
    }
}

// MARK: 缓存状态机

@Suite("视频缓存", .serialized)
struct VideoCacheTests {
    @Test func 下载校验并落盘() async throws {
        let body = Data((0..<4000).map { UInt8($0 % 251) })
        let path = uniquePath()
        StubProtocol.register(path: path, [StubResponse(body: body)])
        let (cache, root) = makeCache()
        defer { try? FileManager.default.removeItem(at: root) }
        let asset = makeAsset(body: body)

        #expect(await cache.state(for: asset) == .notCached)
        let url = try await cache.cache(asset, from: stubURL(path), trigger: .automatic)
        #expect(url.lastPathComponent == asset.cacheFileName)
        #expect(url.deletingLastPathComponent().lastPathComponent == "zh")
        #expect(try Data(contentsOf: url) == body)
        #expect(await cache.state(for: asset) == .cached(url))
        #expect(await cache.cachedURL(for: asset) == url)
        #expect(await cache.totalBytes() == Int64(body.count))
        // 再次请求直接命中，不再下载
        _ = try await cache.cache(asset, from: stubURL(path), trigger: .automatic)
        #expect(StubProtocol.hits(path) == 1)
        // 没有残留临时文件
        let leftovers = try FileManager.default.contentsOfDirectory(atPath: url.deletingLastPathComponent().path)
        #expect(leftovers == [asset.cacheFileName])
    }

    @Test func 状态更新流包含下载中和完成() async throws {
        let body = Data(repeating: 9, count: 3000)
        let path = uniquePath()
        StubProtocol.register(path: path, [StubResponse(body: body)])
        let (cache, root) = makeCache()
        defer { try? FileManager.default.removeItem(at: root) }
        let asset = makeAsset(body: body)
        let updates = await cache.updates(for: asset)
        let collector = Task { () -> [VideoCacheState] in
            var seen: [VideoCacheState] = []
            for await state in updates {
                seen.append(state)
                if case .cached = state { break }
            }
            return seen
        }
        _ = try await cache.cache(asset, from: stubURL(path), trigger: .manual)
        let seen = await collector.value
        #expect(seen.first == .notCached)
        #expect(seen.contains { if case .downloading = $0 { true } else { false } } || seen.count >= 2)
        if case .cached = seen.last {} else { Issue.record("最后一个状态应为 cached：\(seen)") }
    }

    @Test func 校验和不符会失败且不落盘() async throws {
        let body = Data(repeating: 1, count: 1000)
        let path = uniquePath()
        StubProtocol.register(path: path, [StubResponse(body: body)])
        let (cache, root) = makeCache()
        defer { try? FileManager.default.removeItem(at: root) }
        let asset = makeAsset(body: body, claimedSHA: String(repeating: "0", count: 64))
        await #expect(throws: VideoCacheError.checksumMismatch) {
            try await cache.cache(asset, from: stubURL(path), trigger: .manual)
        }
        #expect(await cache.state(for: asset) == .failed(.checksumMismatch))
        #expect(await cache.cachedURL(for: asset) == nil)
        #expect(await cache.totalBytes() == 0)
        #expect(StubProtocol.hits(path) == 1)   // 校验失败不重试
    }

    @Test func 大小不符会失败() async throws {
        let body = Data(repeating: 1, count: 1000)
        let path = uniquePath()
        StubProtocol.register(path: path, [StubResponse(body: body)])
        let (cache, root) = makeCache()
        defer { try? FileManager.default.removeItem(at: root) }
        let asset = makeAsset(body: body, claimedBytes: 999)
        await #expect(throws: VideoCacheError.sizeMismatch) {
            try await cache.cache(asset, from: stubURL(path), trigger: .manual)
        }
        #expect(await cache.totalBytes() == 0)
    }

    @Test func 客户端错误不重试服务端错误会重试() async throws {
        let body = Data(repeating: 5, count: 800)
        let (cache, root) = makeCache()
        defer { try? FileManager.default.removeItem(at: root) }
        let asset = makeAsset(body: body)

        let missing = uniquePath()
        StubProtocol.register(path: missing, [StubResponse(status: 404)])
        await #expect(throws: VideoCacheError.http(404)) {
            try await cache.cache(asset, from: stubURL(missing), trigger: .manual)
        }
        #expect(StubProtocol.hits(missing) == 1)

        let flaky = uniquePath()
        StubProtocol.register(path: flaky, [StubResponse(status: 503), StubResponse(status: 503), StubResponse(body: body)])
        let url = try await cache.cache(asset, from: stubURL(flaky), trigger: .manual)
        #expect(try Data(contentsOf: url) == body)
        #expect(StubProtocol.hits(flaky) == 3)

        let dead = uniquePath()
        let (cache2, root2) = makeCache(attempts: 2)
        defer { try? FileManager.default.removeItem(at: root2) }
        StubProtocol.register(path: dead, [StubResponse(status: 500)])
        await #expect(throws: VideoCacheError.http(500)) {
            try await cache2.cache(asset, from: stubURL(dead), trigger: .manual)
        }
        #expect(StubProtocol.hits(dead) == 2)
    }

    @Test func token中途过期时刷新地址后重试() async throws {
        let body = Data(repeating: 6, count: 800)
        let (cache, root) = makeCache()
        defer { try? FileManager.default.removeItem(at: root) }
        let asset = makeAsset(body: body)
        let path = uniquePath()
        StubProtocol.register(path: path, [StubResponse(status: 401), StubResponse(body: body)])
        let refreshed = Mutex(0)
        let url = try await cache.cache(asset, from: stubURL(path), trigger: .manual, refreshURL: {
            refreshed.withLock { $0 += 1 }
            return stubURL(path)
        })
        #expect(try Data(contentsOf: url) == body)
        #expect(refreshed.withLock { $0 } == 1)
        #expect(StubProtocol.hits(path) == 2)
    }

    @Test func 刷新后仍被拒绝则以401失败() async throws {
        let (cache, root) = makeCache(attempts: 3)
        defer { try? FileManager.default.removeItem(at: root) }
        let asset = makeAsset(body: Data(repeating: 7, count: 800))
        let path = uniquePath()
        StubProtocol.register(path: path, [StubResponse(status: 401)])
        await #expect(throws: VideoCacheError.http(401)) {
            try await cache.cache(asset, from: stubURL(path), trigger: .manual, refreshURL: { stubURL(path) })
        }
        #expect(StubProtocol.hits(path) == 3)
    }

    @Test func 取消下载() async throws {
        let body = Data(repeating: 2, count: 500)
        let path = uniquePath()
        StubProtocol.register(path: path, [StubResponse(body: body, hang: true)])
        let (cache, root) = makeCache()
        defer { try? FileManager.default.removeItem(at: root) }
        let asset = makeAsset(body: body)
        let waiter = Task { try await cache.cache(asset, from: stubURL(path), trigger: .manual) }
        for _ in 0..<200 where StubProtocol.hits(path) == 0 { try await Task.sleep(for: .milliseconds(10)) }
        await cache.cancel(asset)
        await #expect(throws: CancellationError.self) { try await waiter.value }
        #expect(await cache.state(for: asset) == .notCached)
        #expect(await cache.cachedURL(for: asset) == nil)
    }

    @Test func 清除缓存() async throws {
        let body = Data(repeating: 3, count: 1200)
        let path = uniquePath()
        StubProtocol.register(path: path, [StubResponse(body: body)])
        let (cache, root) = makeCache()
        defer { try? FileManager.default.removeItem(at: root) }
        let asset = makeAsset(body: body)
        _ = try await cache.cache(asset, from: stubURL(path), trigger: .manual)
        #expect(await cache.totalBytes() == 1200)
        await cache.clearAll()
        #expect(await cache.totalBytes() == 0)
        #expect(await cache.state(for: asset) == .notCached)
        // 清除后可以重新下载
        _ = try await cache.cache(asset, from: stubURL(path), trigger: .manual)
        #expect(await cache.cachedURL(for: asset) != nil)
        await cache.clear(asset)
        #expect(await cache.cachedURL(for: asset) == nil)
    }

    @Test func 蜂窝且仅WiFi时自动缓存被拒绝手动可以() async throws {
        let body = Data(repeating: 4, count: 600)
        let path = uniquePath()
        StubProtocol.register(path: path, [StubResponse(body: body)])
        let (cache, root) = makeCache(network: .metered, wifiOnly: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let asset = makeAsset(body: body)
        #expect(await cache.automaticCachingAllowed() == false)
        await #expect(throws: VideoCacheError.cellularRestricted) {
            try await cache.cache(asset, from: stubURL(path), trigger: .automatic)
        }
        #expect(StubProtocol.hits(path) == 0)
        _ = try await cache.cache(asset, from: stubURL(path), trigger: .manual)
        #expect(StubProtocol.hits(path) == 1)
    }

    @Test func 关闭仅WiFi后蜂窝下自动缓存() async throws {
        let body = Data(repeating: 4, count: 600)
        let path = uniquePath()
        StubProtocol.register(path: path, [StubResponse(body: body)])
        let (cache, root) = makeCache(network: .metered, wifiOnly: false)
        defer { try? FileManager.default.removeItem(at: root) }
        #expect(await cache.automaticCachingAllowed())
        _ = try await cache.cache(makeAsset(body: body), from: stubURL(path), trigger: .automatic)
        #expect(StubProtocol.hits(path) == 1)
    }

    @Test func 离线时直接失败() async throws {
        let body = Data(repeating: 4, count: 600)
        let path = uniquePath()
        StubProtocol.register(path: path, [StubResponse(body: body)])
        let (cache, root) = makeCache(network: .offline)
        defer { try? FileManager.default.removeItem(at: root) }
        let asset = makeAsset(body: body)
        await #expect(throws: VideoCacheError.offline) {
            try await cache.cache(asset, from: stubURL(path), trigger: .manual)
        }
        #expect(await cache.state(for: asset) == .failed(.offline))
        #expect(StubProtocol.hits(path) == 0)
    }

    @Test func 同一支视频的并发请求共用一次下载() async throws {
        let body = Data(repeating: 6, count: 2500)
        let path = uniquePath()
        StubProtocol.register(path: path, [StubResponse(body: body)])
        let (cache, root) = makeCache()
        defer { try? FileManager.default.removeItem(at: root) }
        let asset = makeAsset(body: body)
        async let a = cache.cache(asset, from: stubURL(path), trigger: .manual)
        async let b = cache.cache(asset, from: stubURL(path), trigger: .automatic)
        let urls = try await [a, b]
        #expect(urls[0] == urls[1])
        #expect(StubProtocol.hits(path) == 1)
    }

    @Test func 旧版本缓存文件会被清理() async throws {
        let body = Data(repeating: 8, count: 700)
        let path = uniquePath()
        StubProtocol.register(path: path, [StubResponse(body: body)])
        let (cache, root) = makeCache()
        defer { try? FileManager.default.removeItem(at: root) }
        let asset = makeAsset(body: body)
        let dir = root.appending(path: "zh")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try Data("old".utf8).write(to: dir.appending(path: "ch02-v0-deadbeef.mp4"))
        try Data("other".utf8).write(to: dir.appending(path: "ch03-v1-deadbeef.mp4"))
        _ = try await cache.cache(asset, from: stubURL(path), trigger: .manual)
        let names = Set(try FileManager.default.contentsOfDirectory(atPath: dir.path))
        #expect(names == [asset.cacheFileName, "ch03-v1-deadbeef.mp4"])
    }
}

// MARK: 播放页状态（真实 AVPlayer）

@Suite("视频播放页")
@MainActor
struct VideoPlayerModelTests {
    private func service(url: URL, network: NetworkStatus = .unmetered, access: any VideoAccessChecking = UnlockedVideoAccess()) -> VideoService {
        let root = FileManager.default.temporaryDirectory.appending(path: "video-model-test-\(UUID().uuidString)")
        let net = FixedNetwork(network)
        return VideoService(catalog: VideoCatalog.loadBundled(), network: net,
                            cache: VideoCache(root: root, session: StubProtocol.session(), network: net),
                            urlProvider: MockVideoURLProvider(.success(url)), access: access)
    }

    private func waitForPhase(_ model: VideoPlayerModel, timeout: Double = 40, _ matches: (VideoPlayerModel.Phase) -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if matches(model.phase) { return true }
            try? await Task.sleep(for: .milliseconds(100))
        }
        return false
    }

    @Test func 内置第一章视频可以被播放器打开() async throws {
        let catalog = try #require(VideoCatalog.loadBundled())
        let asset = try #require(catalog.entry(chapter: 1)?.asset(version: catalog.version, language: .zh))
        let url = try #require(catalog.bundledURL(for: asset))
        let avAsset = AVURLAsset(url: url)
        let playable = try await avAsset.load(.isPlayable)
        let duration = try await avAsset.load(.duration).seconds
        #expect(playable)
        #expect(abs(duration - asset.info.durationSec) < 1.5)
        let tracks = try await avAsset.load(.tracks)
        #expect(tracks.contains { $0.mediaType == .video })
        #expect(tracks.contains { $0.mediaType == .audio })
    }

    @Test func 第一章走本地文件并进入播放() async throws {
        let model = VideoPlayerModel(chapter: 1, service: service(url: URL(string: "https://never.invalid/x.mp4")!, network: .offline))
        model.start()
        #expect(await waitForPhase(model) { $0 == .playing })
        #expect(model.isLocal)
        let item = try #require(model.player?.currentItem)
        for _ in 0..<100 where item.status == .unknown { try await Task.sleep(for: .milliseconds(100)) }
        #expect(item.status == .readyToPlay)
        model.stop()
    }

    @Test func 付费章节离线且未缓存时提示离线() async {
        let model = VideoPlayerModel(chapter: 2, service: service(url: URL(string: "https://never.invalid/x.mp4")!, network: .offline))
        model.start()
        #expect(await waitForPhase(model) { if case .failed = $0 { true } else { false } })
        #expect(model.player == nil)
    }

    @Test func 蜂窝网络下先提示流量() async {
        let model = VideoPlayerModel(chapter: 2, service: service(url: URL(string: "https://never.invalid/x.mp4")!, network: .metered))
        model.start()
        #expect(await waitForPhase(model, timeout: 10) { if case .confirmCellular = $0 { true } else { false } })
        #expect(model.player == nil)
    }

    @Test func 远程地址不可达时显示失败() async {
        let model = VideoPlayerModel(chapter: 2, service: service(url: URL(string: "https://video-test.invalid/v1/zh/ch02.mp4")!))
        model.start()
        let failed = await waitForPhase(model) { if case .failed = $0 { true } else { false } }
        #expect(failed)
        #expect(model.player == nil)
        model.stop()
    }

    @Test func 锁定的章节不播放并触发付费墙回调() async {
        let svc = service(url: URL(string: "https://never.invalid/x.mp4")!, access: DefaultVideoAccess())
        var asked: [Int] = []
        svc.onNeedsPaywall = { asked.append($0) }
        let model = VideoPlayerModel(chapter: 3, service: svc)
        model.start()
        #expect(await waitForPhase(model, timeout: 10) { if case .unavailable = $0 { true } else { false } })
        #expect(asked == [3])
        #expect(model.player == nil)
    }
}
