import AVFoundation
import Foundation
import Testing
@testable import SystemDesignQuest

private let sampleCatalogJSON = """
{"version":"v1","chapters":[
 {"chapter":1,"free":true,"titles":{"zh":"从零扩展","en":"Scaling"},
  "files":{"zh":{"file":"ch01.mp4","durationSec":224.1}}},
 {"chapter":2,"free":false,"titles":{"zh":"估算","en":"Estimation"},
  "files":{"zh":{"file":"ch02.sdqv","durationSec":188.6},
           "en":{"file":"ch02.sdqv","durationSec":190}}}
]}
"""

@Suite("视频清单与选源")
struct VideoCatalogTests {
    @Test func 解析清单() throws {
        let catalog = try VideoCatalog.decode(Data(sampleCatalogJSON.utf8))
        #expect(catalog.chapters.count == 2)
        let first = try #require(catalog.entry(chapter: 1))
        #expect(first.free)
        #expect(first.files["zh"]?.isEncrypted == false)
        #expect(catalog.entry(chapter: 2)?.files["en"]?.isEncrypted == true)
        #expect(first.title(for: .en) == "Scaling")
    }

    @Test func 缺语言时回落到另一种语言() throws {
        let catalog = try VideoCatalog.decode(Data(sampleCatalogJSON.utf8))
        let one = try #require(catalog.entry(chapter: 1))
        #expect(one.asset(language: .en)?.language == .zh)
        let two = try #require(catalog.entry(chapter: 2))
        #expect(two.asset(language: .en)?.language == .en)
        #expect(two.asset(language: .en)?.info.durationSec == 190)
    }

    @Test func 首选语言文件不在包里时回落_都不在时仍返回首选() throws {
        let two = try #require(VideoCatalog.decode(Data(sampleCatalogJSON.utf8)).entry(chapter: 2))
        #expect(two.asset(language: .en, isAvailable: { $0.language == .zh })?.language == .zh)
        #expect(two.asset(language: .en, isAvailable: { _ in false })?.language == .en)
    }

    @Test func 加密标签绑定语言和章节() throws {
        let two = try #require(VideoCatalog.decode(Data(sampleCatalogJSON.utf8)).entry(chapter: 2))
        #expect(two.asset(language: .zh)?.cryptoLabel == "zh/ch02")
        #expect(VideoCrypto.label(language: .en, chapter: 28) == "en/ch28")
    }

    @Test func 时长文案() {
        let en = Locale(identifier: "en_US")
        #expect(VideoFormat.duration(224.1, locale: en) == "3 min, 44 sec")
        #expect(VideoFormat.duration(60, locale: en) == "1 min")
    }

    @Test func 内置清单完整且视频文件都在包里() throws {
        let catalog = try #require(VideoCatalog.loadBundled())
        #expect(catalog.chapters.map(\.chapter) == Array(1...28))
        #expect(catalog.chapters.filter(\.free).map(\.chapter) == [1])
        for entry in catalog.chapters {
            #expect(Set(entry.files.keys) == ["zh", "en"])
            for lang in AppLanguage.allCases {
                let asset = try #require(entry.asset(language: lang))
                #expect(asset.language == lang)
                #expect(asset.info.isEncrypted == !entry.free)
                let url = try #require(catalog.bundledURL(for: asset), "缺少 \(lang.rawValue)/\(asset.info.file)")
                if asset.info.isEncrypted {
                    #expect(try Data(contentsOf: url, options: .mappedIfSafe).prefix(4) == VideoCrypto.magic)
                }
            }
        }
    }

    @Test func 应用语言跟随系统语言() {
        #expect(AppLanguage.resolve(preferred: ["zh-Hans-CN"]) == .zh)
        #expect(AppLanguage.resolve(preferred: ["zh-Hant-TW"]) == .zh)
        #expect(AppLanguage.resolve(preferred: ["en-US"]) == .en)
        #expect(AppLanguage.resolve(preferred: ["ja-JP", "zh-Hans"]) == .en)
        #expect(AppLanguage.resolve(preferred: []) == .en)
    }

    @Test @MainActor func 默认权限只放行第一章() {
        let access = DefaultVideoAccess()
        #expect(access.canPlay(chapter: 1))
        #expect(!access.canPlay(chapter: 2))
        let service = VideoService(catalog: nil, vault: testVault().vault, access: access)
        var asked: [Int] = []
        service.onNeedsPaywall = { asked.append($0) }
        #expect(service.requestPlayback(chapter: 1))
        #expect(!service.requestPlayback(chapter: 5))
        #expect(asked == [5])
    }
}

// MARK: 播放页状态（真实 AVPlayer）

@Suite("视频播放页")
@MainActor
struct VideoPlayerModelTests {
    private func service(access: any VideoAccessChecking = UnlockedVideoAccess(), key: Data? = nil,
                         jws: String? = nil, language: AppLanguage = .zh) -> (VideoService, TestVault) {
        let tv = testVault()
        if let key { try? tv.vault.storeKey(key) }
        let client = VideoKeyClient(endpoint: URL(string: "https://never.invalid/v1/key")!,
                                    signedTransaction: { jws }, transport: { _ in throw URLError(.notConnectedToInternet) })
        let svc = VideoService(catalog: VideoCatalog.loadBundled(), vault: tv.vault,
                               provisioner: VideoKeyProvisioner(vault: tv.vault, client: client), access: access)
        svc.language = { language }
        return (svc, tv)
    }

    private func waitForPhase(_ model: VideoPlayerModel, timeout: Double = 40, _ matches: (VideoPlayerModel.Phase) -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if matches(model.phase) { return true }
            try? await Task.sleep(for: .milliseconds(100))
        }
        return false
    }

    private func isFailed(_ phase: VideoPlayerModel.Phase) -> Bool { if case .failed = phase { true } else { false } }

    @Test func 内置第一章视频可以被播放器打开() async throws {
        let catalog = try #require(VideoCatalog.loadBundled())
        for lang in AppLanguage.allCases {
            let asset = try #require(catalog.entry(chapter: 1)?.asset(language: lang))
            let url = try #require(catalog.bundledURL(for: asset))
            let avAsset = AVURLAsset(url: url)
            #expect(try await avAsset.load(.isPlayable))
            let duration = try await avAsset.load(.duration).seconds
            #expect(abs(duration - asset.info.durationSec) < 1.5)
            let tracks = try await avAsset.load(.tracks)
            #expect(tracks.contains { $0.mediaType == .video })
            #expect(tracks.contains { $0.mediaType == .audio })
        }
    }

    @Test func 第一章明文直接播放不需要密钥() async throws {
        let (svc, tv) = service()
        defer { tv.cleanup() }
        let model = VideoPlayerModel(chapter: 1, service: svc)
        model.start()
        #expect(await waitForPhase(model) { $0 == .playing })
        let item = try #require(model.player?.currentItem)
        for _ in 0..<100 where item.status == .unknown { try await Task.sleep(for: .milliseconds(100)) }
        #expect(item.status == .readyToPlay)
        #expect(!FileManager.default.fileExists(atPath: tv.vault.directory.path))
        model.stop()
    }

    @Test func 付费章节没有密钥也没有购买凭证时提示没有凭证() async {
        let (svc, tv) = service(jws: nil)
        defer { tv.cleanup() }
        let model = VideoPlayerModel(chapter: 2, service: svc)
        model.start()
        #expect(await waitForPhase(model) { isFailed($0) })
        #expect(model.phase == .failed(VideoKeyError.noPurchase.userMessage))
        #expect(model.player == nil)
    }

    @Test func 有购买凭证但连不上服务器时提示网络() async {
        let (svc, tv) = service(jws: "JWS")
        defer { tv.cleanup() }
        let model = VideoPlayerModel(chapter: 2, service: svc)
        model.start()
        #expect(await waitForPhase(model) { isFailed($0) })
        #expect(model.phase == .failed(VideoKeyError.network.userMessage))
    }

    @Test func 密钥不对时提示解密失败且不留临时文件() async {
        let (svc, tv) = service(key: Data(repeating: 7, count: 32))
        defer { tv.cleanup() }
        let model = VideoPlayerModel(chapter: 2, service: svc)
        model.start()
        #expect(await waitForPhase(model) { isFailed($0) })
        #expect(model.phase == .failed(VideoVaultError.decryptFailed.userMessage))
        let leftovers = (try? FileManager.default.contentsOfDirectory(atPath: tv.vault.directory.path)) ?? []
        #expect(leftovers.isEmpty)
    }

    @Test func 锁定的章节不播放并触发付费墙回调() async {
        let (svc, tv) = service(access: DefaultVideoAccess())
        defer { tv.cleanup() }
        var asked: [Int] = []
        svc.onNeedsPaywall = { asked.append($0) }
        let model = VideoPlayerModel(chapter: 3, service: svc)
        model.start()
        #expect(await waitForPhase(model, timeout: 10) { if case .unavailable = $0 { true } else { false } })
        #expect(asked == [3])
        #expect(model.player == nil)
    }
}

@Suite("视频页旋转锁")
struct OrientationLockTests {
    @Test func landscapeLockReleasesOnlyWhenPhoneTurnsLandscape() {
        // 手机还竖着拿时不能解锁，否则系统会立刻转回竖屏（真机上「点了又竖回去」的 bug）
        #expect(!OrientationController.shouldReleaseLock(.landscape, device: .portrait))
        #expect(!OrientationController.shouldReleaseLock(.landscape, device: .faceUp))
        #expect(!OrientationController.shouldReleaseLock(.landscape, device: .unknown))
        #expect(OrientationController.shouldReleaseLock(.landscape, device: .landscapeLeft))
        #expect(OrientationController.shouldReleaseLock(.landscape, device: .landscapeRight))
    }

    @Test func portraitLockReleasesOnlyWhenPhoneTurnsUpright() {
        #expect(!OrientationController.shouldReleaseLock(.portrait, device: .landscapeLeft))
        #expect(!OrientationController.shouldReleaseLock(.portrait, device: .portraitUpsideDown))
        #expect(OrientationController.shouldReleaseLock(.portrait, device: .portrait))
    }
}
