import CryptoKit
import Foundation
import Security
import Synchronization

/// 付费视频的加密规范（与 `动画讲解/lib/encrypt-videos.mjs` 一致）。
/// 文件 = 4 字节魔数 "SDQV" + `AES.GCM.SealedBox.combined`（nonce 12 + 密文 + tag 16）；
/// 每个文件的密钥由主密钥经 HKDF-SHA256 派生（info = "zh/ch07"），同一个标签也作为 AES-GCM 的 AAD，把密文绑定到语言和章节。
enum VideoCrypto {
    static let fileExtension = "sdqv"
    static let magic = Data("SDQV".utf8)
    static let salt = Data("sdq-video-v1".utf8)
    static let masterKeyLength = 32

    /// `zh/ch07`
    static func label(language: AppLanguage, chapter: Int) -> String {
        "\(language.rawValue)/ch\(String(format: "%02d", chapter))"
    }

    static func fileKey(master: Data, label: String) -> SymmetricKey {
        HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: master), salt: salt,
                               info: Data(label.utf8), outputByteCount: 32)
    }

    static func decrypt(_ file: Data, master: Data, label: String) throws -> Data {
        guard file.starts(with: magic) else { throw VideoVaultError.decryptFailed }
        do {
            let box = try AES.GCM.SealedBox(combined: Data(file.dropFirst(magic.count)))
            return try AES.GCM.open(box, using: fileKey(master: master, label: label), authenticating: Data(label.utf8))
        } catch {
            throw VideoVaultError.decryptFailed
        }
    }
}

enum VideoVaultError: Error, Equatable, Sendable {
    /// 本机还没有主密钥。
    case missingKey
    /// 随包的视频文件不存在。
    case fileMissing
    /// 魔数、格式或认证失败（密钥错误、章节错配、文件损坏）。
    case decryptFailed
    /// 临时文件写入失败。
    case writeFailed
    /// 主密钥长度不对，或 Keychain 写入失败。
    case invalidKey

    var userMessage: String {
        switch self {
        case .missingKey: String(localized: "本机还没有视频密钥。请联网后重试。")
        case .fileMissing: String(localized: "没有找到本章的视频文件。")
        case .decryptFailed: String(localized: "视频文件无法解密，可能已损坏。请重试，或更新 App。")
        case .writeFailed: String(localized: "无法准备视频，请检查设备存储空间后重试。")
        case .invalidKey: String(localized: "视频密钥无效，请稍后重试。")
        }
    }
}

/// 主密钥的 Keychain 存取：仅本机、首次解锁后可读，不同步 iCloud。
struct VideoKeychain: Sendable {
    let service: String
    var account = "video-master-key"

    static let production = VideoKeychain(service: "com.kadaliao.SystemDesignQuest.video")

    private var baseQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account,
         kSecAttrSynchronizable as String: false]
    }

    func load() -> Data? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    func save(_ data: Data) throws {
        SecItemDelete(baseQuery as CFDictionary)
        var attributes = baseQuery
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess else { throw VideoVaultError.invalidKey }
    }

    func delete() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}

/// 主密钥 + 解密到临时文件。付费视频随包是密文，播放前在后台线程解密到专用临时目录，关闭播放页时删除。
final class VideoVault: Sendable {
    let keychain: VideoKeychain
    let directory: URL
    /// 仅 DEBUG：`-videoDebugKey` 注入的主密钥，只在内存里，不进 Keychain。
    private let debugKey = Mutex<Data?>(nil)

    init(keychain: VideoKeychain = .production,
         directory: URL = FileManager.default.temporaryDirectory.appending(path: "sdq-playback", directoryHint: .isDirectory)) {
        self.keychain = keychain
        self.directory = directory
    }

    /// 正式实例；DEBUG 构建读取 `-videoDebugKey <base64>`。
    static func makeProduction(arguments: [String] = ProcessInfo.processInfo.arguments) -> VideoVault {
        let vault = VideoVault()
        #if DEBUG
        if let i = arguments.firstIndex(of: "-videoDebugKey"), i + 1 < arguments.count,
           let key = Data(base64Encoded: arguments[i + 1]), key.count == VideoCrypto.masterKeyLength {
            vault.setDebugKey(key)
        }
        #endif
        return vault
    }

    func setDebugKey(_ key: Data?) { debugKey.withLock { $0 = key } }

    // MARK: 主密钥

    func masterKey() -> Data? { debugKey.withLock { $0 } ?? keychain.load() }
    var hasKey: Bool { masterKey() != nil }

    func storeKey(_ key: Data) throws {
        guard key.count == VideoCrypto.masterKeyLength else { throw VideoVaultError.invalidKey }
        try keychain.save(key)
    }

    /// 权益被撤销（退款等）：删除 Keychain 里的密钥和所有临时明文。
    func revoke() {
        keychain.delete()
        cleanTemporary()
    }

    // MARK: 播放文件

    /// 返回可交给 AVPlayer 的本地文件：明文原样返回，密文解密到临时目录。解密在后台线程。
    func prepare(source: URL, asset: VideoAsset) async throws -> URL {
        guard asset.info.isEncrypted else { return source }
        guard let master = masterKey() else { throw VideoVaultError.missingKey }
        let label = asset.cryptoLabel
        let directory = self.directory
        return try await Task.detached(priority: .userInitiated) {
            guard let file = try? Data(contentsOf: source, options: .mappedIfSafe) else { throw VideoVaultError.fileMissing }
            let plain = try VideoCrypto.decrypt(file, master: master, label: label)
            return try Self.writeTemporary(plain, in: directory)
        }.value
    }

    private static func writeTemporary(_ data: Data, in directory: URL) throws -> URL {
        let fm = FileManager.default
        do {
            try fm.createDirectory(at: directory, withIntermediateDirectories: true)
            var dir = directory
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? dir.setResourceValues(values)
            var url = directory.appending(path: UUID().uuidString + ".mp4")
            try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            try? url.setResourceValues(values)
            return url
        } catch {
            throw VideoVaultError.writeFailed
        }
    }

    /// 删除播放用的临时文件；不在临时目录里的（明文随包文件）不动。
    func discard(_ url: URL) {
        guard url.deletingLastPathComponent().standardizedFileURL == directory.standardizedFileURL else { return }
        try? FileManager.default.removeItem(at: url)
    }

    /// 清空临时目录（启动时清理上次残留，或撤销权益时）。
    func cleanTemporary() {
        try? FileManager.default.removeItem(at: directory)
    }
}
