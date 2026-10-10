import CryptoKit
import Foundation
import Security
import Synchronization
import Testing
@testable import SystemDesignQuest

/// 独立 Keychain service 和临时目录的保险库，测试结束调用 `cleanup()`。
struct TestVault {
    let vault: VideoVault
    func cleanup() {
        vault.keychain.delete()
        try? FileManager.default.removeItem(at: vault.directory)
    }
}

func testVault() -> TestVault {
    let id = UUID().uuidString
    return TestVault(vault: VideoVault(
        keychain: VideoKeychain(service: "com.kadaliao.SystemDesignQuest.tests.\(id)"),
        directory: FileManager.default.temporaryDirectory.appending(path: "sdq-vault-test-\(id)", directoryHint: .isDirectory)))
}

/// 按规范封装样本文件：魔数 + AES-GCM combined，AAD 与 HKDF info 都是 "lang/chNN"。
func sealSample(_ plain: Data, master: Data, label: String) throws -> Data {
    let key = HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: master), salt: Data("sdq-video-v1".utf8),
                                     info: Data(label.utf8), outputByteCount: 32)
    let box = try AES.GCM.seal(plain, using: key, authenticating: Data(label.utf8))
    return Data("SDQV".utf8) + box.combined!
}

private let master = Data((0..<32).map { UInt8($0 &* 7 &+ 3) })
private let plain = Data((0..<5000).map { UInt8($0 % 251) })

private func sampleAsset(chapter: Int = 7, language: AppLanguage = .zh, file: String? = nil) -> VideoAsset {
    VideoAsset(chapter: chapter, language: language,
               info: VideoFile(file: file ?? String(format: "ch%02d.sdqv", chapter), durationSec: 1))
}

private func writeSample(_ data: Data, name: String = "ch07.sdqv") throws -> URL {
    let url = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString)-\(name)")
    try data.write(to: url)
    return url
}

@Suite("视频解密")
struct VideoCryptoTests {
    @Test func 派生的文件密钥与规范一致且随标签不同() {
        let k1 = VideoCrypto.fileKey(master: master, label: "zh/ch07")
        let expected = HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: master), salt: Data("sdq-video-v1".utf8),
                                              info: Data("zh/ch07".utf8), outputByteCount: 32)
        #expect(k1.withUnsafeBytes { Data($0) } == expected.withUnsafeBytes { Data($0) })
        let k2 = VideoCrypto.fileKey(master: master, label: "en/ch07")
        let k3 = VideoCrypto.fileKey(master: master, label: "zh/ch08")
        #expect(k1.withUnsafeBytes { Data($0) } != k2.withUnsafeBytes { Data($0) })
        #expect(k1.withUnsafeBytes { Data($0) } != k3.withUnsafeBytes { Data($0) })
    }

    @Test func 往返解密() throws {
        let file = try sealSample(plain, master: master, label: "zh/ch07")
        #expect(try VideoCrypto.decrypt(file, master: master, label: "zh/ch07") == plain)
    }

    @Test func 语言或章节错配会失败() throws {
        let file = try sealSample(plain, master: master, label: "zh/ch07")
        #expect(throws: VideoVaultError.decryptFailed) { try VideoCrypto.decrypt(file, master: master, label: "en/ch07") }
        #expect(throws: VideoVaultError.decryptFailed) { try VideoCrypto.decrypt(file, master: master, label: "zh/ch08") }
    }

    @Test func 仅AAD错配也会失败() throws {
        // 用 zh/ch07 的派生密钥、但 AAD 写成别的标签封装
        let key = VideoCrypto.fileKey(master: master, label: "zh/ch07")
        let box = try AES.GCM.seal(plain, using: key, authenticating: Data("zh/ch99".utf8))
        let file = VideoCrypto.magic + box.combined!
        #expect(throws: VideoVaultError.decryptFailed) { try VideoCrypto.decrypt(file, master: master, label: "zh/ch07") }
    }

    @Test func 错误主密钥失败() throws {
        let file = try sealSample(plain, master: master, label: "zh/ch07")
        let wrong = Data(repeating: 9, count: 32)
        #expect(throws: VideoVaultError.decryptFailed) { try VideoCrypto.decrypt(file, master: wrong, label: "zh/ch07") }
    }

    @Test func 魔数错误_截断_篡改都失败() throws {
        var file = try sealSample(plain, master: master, label: "zh/ch07")
        #expect(throws: VideoVaultError.decryptFailed) { try VideoCrypto.decrypt(Data("XXXX".utf8) + file.dropFirst(4), master: master, label: "zh/ch07") }
        #expect(throws: VideoVaultError.decryptFailed) { try VideoCrypto.decrypt(file.prefix(10), master: master, label: "zh/ch07") }
        #expect(throws: VideoVaultError.decryptFailed) { try VideoCrypto.decrypt(Data(), master: master, label: "zh/ch07") }
        file[file.count / 2] ^= 0xFF
        #expect(throws: VideoVaultError.decryptFailed) { try VideoCrypto.decrypt(file, master: master, label: "zh/ch07") }
    }
}

@Suite("视频保险库", .serialized)
struct VideoVaultTests {
    @Test func Keychain存取与删除() throws {
        let tv = testVault()
        defer { tv.cleanup() }
        #expect(tv.vault.masterKey() == nil)
        #expect(!tv.vault.hasKey)
        try tv.vault.storeKey(master)
        #expect(tv.vault.masterKey() == master)
        let other = Data(repeating: 1, count: 32)
        try tv.vault.storeKey(other)  // 覆盖
        #expect(tv.vault.masterKey() == other)
        tv.vault.keychain.delete()
        #expect(tv.vault.masterKey() == nil)
    }

    @Test func 长度不对的密钥被拒绝() {
        let tv = testVault()
        defer { tv.cleanup() }
        #expect(throws: VideoVaultError.invalidKey) { try tv.vault.storeKey(Data(repeating: 1, count: 16)) }
        #expect(!tv.vault.hasKey)
    }

    @Test func Keychain条目不同步且仅本机() throws {
        let tv = testVault()
        defer { tv.cleanup() }
        try tv.vault.storeKey(master)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: tv.vault.keychain.service,
                                    kSecAttrAccount as String: tv.vault.keychain.account,
                                    kSecAttrSynchronizable as String: kSecAttrSynchronizableAny,
                                    kSecReturnAttributes as String: true]
        var result: AnyObject?
        #expect(SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess)
        let attrs = try #require(result as? [String: Any])
        #expect(attrs[kSecAttrAccessible as String] as? String == kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
        let sync = attrs[kSecAttrSynchronizable as String]
        #expect(sync == nil || (sync as? NSNumber)?.boolValue == false)
    }

    @Test func 调试密钥优先且不写Keychain() {
        let tv = testVault()
        defer { tv.cleanup() }
        tv.vault.setDebugKey(master)
        #expect(tv.vault.masterKey() == master)
        #expect(tv.vault.keychain.load() == nil)
    }

    @Test func 解密到临时文件并可删除() async throws {
        let tv = testVault()
        defer { tv.cleanup() }
        try tv.vault.storeKey(master)
        let source = try writeSample(sealSample(plain, master: master, label: "zh/ch07"))
        defer { try? FileManager.default.removeItem(at: source) }
        let url = try await tv.vault.prepare(source: source, asset: sampleAsset())
        #expect(url.deletingLastPathComponent().standardizedFileURL == tv.vault.directory.standardizedFileURL)
        #expect(url.pathExtension == "mp4")
        #expect(try Data(contentsOf: url) == plain)
        #expect(try url.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        tv.vault.discard(url)
        #expect(!FileManager.default.fileExists(atPath: url.path))
    }

    @Test func 明文文件原样返回_discard不会删随包文件() async throws {
        let tv = testVault()
        defer { tv.cleanup() }
        let source = try writeSample(plain, name: "ch01.mp4")
        defer { try? FileManager.default.removeItem(at: source) }
        let url = try await tv.vault.prepare(source: source, asset: sampleAsset(chapter: 1, file: "ch01.mp4"))
        #expect(url == source)
        tv.vault.discard(url)
        #expect(FileManager.default.fileExists(atPath: source.path))
    }

    @Test func 缺密钥_缺文件_章节错配_分别报错() async throws {
        let tv = testVault()
        defer { tv.cleanup() }
        let source = try writeSample(sealSample(plain, master: master, label: "zh/ch07"))
        defer { try? FileManager.default.removeItem(at: source) }
        await #expect(throws: VideoVaultError.missingKey) { try await tv.vault.prepare(source: source, asset: sampleAsset()) }
        try tv.vault.storeKey(master)
        let missing = source.deletingLastPathComponent().appending(path: "nope.sdqv")
        await #expect(throws: VideoVaultError.fileMissing) { try await tv.vault.prepare(source: missing, asset: sampleAsset()) }
        await #expect(throws: VideoVaultError.decryptFailed) { try await tv.vault.prepare(source: source, asset: sampleAsset(chapter: 8)) }
        await #expect(throws: VideoVaultError.decryptFailed) { try await tv.vault.prepare(source: source, asset: sampleAsset(language: .en)) }
        #expect(!FileManager.default.fileExists(atPath: tv.vault.directory.path)
                || ((try? FileManager.default.contentsOfDirectory(atPath: tv.vault.directory.path)) ?? []).isEmpty)
    }

    @Test func 清理临时文件() async throws {
        let tv = testVault()
        defer { tv.cleanup() }
        try tv.vault.storeKey(master)
        let source = try writeSample(sealSample(plain, master: master, label: "zh/ch07"))
        defer { try? FileManager.default.removeItem(at: source) }
        let a = try await tv.vault.prepare(source: source, asset: sampleAsset())
        let b = try await tv.vault.prepare(source: source, asset: sampleAsset())
        #expect(a != b)
        tv.vault.cleanTemporary()
        #expect(!FileManager.default.fileExists(atPath: a.path))
        #expect(!FileManager.default.fileExists(atPath: b.path))
        tv.vault.cleanTemporary()  // 目录不存在时也不出错
    }

    @Test func 退款撤销后删除密钥和临时明文() async throws {
        let tv = testVault()
        defer { tv.cleanup() }
        try tv.vault.storeKey(master)
        let source = try writeSample(sealSample(plain, master: master, label: "zh/ch07"))
        defer { try? FileManager.default.removeItem(at: source) }
        let url = try await tv.vault.prepare(source: source, asset: sampleAsset())
        tv.vault.revoke()
        #expect(tv.vault.masterKey() == nil)
        #expect(!FileManager.default.fileExists(atPath: url.path))
    }

    @Test @MainActor func 权益变化驱动密钥的获取与删除() async throws {
        let tv = testVault()
        defer { tv.cleanup() }
        let fake = FakeKeyServer([.ok(master)])
        let client = VideoKeyClient(signedTransaction: { "JWS" }, transport: fake.transport)
        let service = VideoService(catalog: nil, vault: tv.vault,
                                   provisioner: VideoKeyProvisioner(vault: tv.vault, client: client), access: DefaultVideoAccess())
        service.entitlementChanged(hasFullAccess: true)
        for _ in 0..<100 where !tv.vault.hasKey { try await Task.sleep(for: .milliseconds(50)) }
        #expect(tv.vault.masterKey() == master)
        service.entitlementChanged(hasFullAccess: false)
        #expect(tv.vault.masterKey() == nil)
    }
}
