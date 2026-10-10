import Foundation

/// 视频模块的入口与依赖，GuidebookSheet 和播放页通过它取用。
@MainActor
final class VideoService {
    static var shared = VideoService()

    let catalog: VideoCatalog?
    let vault: VideoVault
    let provisioner: VideoKeyProvisioner
    let bundle: Bundle
    var access: any VideoAccessChecking
    /// 点了锁定的视频时的回调（打开付费墙）。未设置时由界面给出默认提示。
    var onNeedsPaywall: ((Int) -> Void)?
    var language: () -> AppLanguage = { AppLanguage.current }

    init(catalog: VideoCatalog? = VideoCatalog.loadBundled(),
         vault: VideoVault = VideoVault.makeProduction(),
         provisioner: VideoKeyProvisioner? = nil,
         bundle: Bundle = .main,
         access: (any VideoAccessChecking)? = nil) {
        self.catalog = catalog
        self.vault = vault
        self.provisioner = provisioner ?? VideoKeyProvisioner(vault: vault)
        self.bundle = bundle
        if let access {
            self.access = access
        } else if Self.debugUnlockAll {
            self.access = UnlockedVideoAccess()
        } else {
            self.access = DefaultVideoAccess()
        }
    }

    /// 调试用 `-videoUnlockAll`：只在 DEBUG 构建生效，Release 里恒为 false，不能绕过付费。
    /// 付费章节还需要主密钥：用 `-videoDebugKey <base64>` 注入（见 `VideoVault.makeProduction`）。
    static var debugUnlockAll: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-videoUnlockAll")
        #else
        false
        #endif
    }

    /// 点「观看」时调用：可播返回 true；不可播则触发付费墙回调并返回 false。
    func requestPlayback(chapter: Int) -> Bool {
        if access.canPlay(chapter: chapter) { return true }
        onNeedsPaywall?(chapter)
        return false
    }

    /// 该章当前语言的视频；该语言的文件不在包里时回落到另一种语言。
    func asset(chapter: Int) -> VideoAsset? {
        guard let catalog, let entry = catalog.entry(chapter: chapter) else { return nil }
        return entry.asset(language: language()) { [bundle] in catalog.bundledURL(for: $0, bundle: bundle) != nil }
    }

    func title(chapter: Int) -> String? {
        catalog?.entry(chapter: chapter)?.title(for: language())
    }

    // MARK: 权益与密钥

    /// 完整版权益变化：解锁了就在后台静默取密钥（已有则什么都不做）；被撤销（退款）就删密钥和临时明文。
    func entitlementChanged(hasFullAccess: Bool) {
        if hasFullAccess {
            let provisioner = provisioner
            Task { await provisioner.provisionQuietly() }
        } else {
            vault.revoke()
        }
    }

    /// 启动时清理上次残留的临时明文。
    func cleanUpAtLaunch() {
        let vault = vault
        Task.detached(priority: .utility) { vault.cleanTemporary() }
    }
}
