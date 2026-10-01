import Foundation

/// 播放策略：本地文件优先；没有就直接播远程并（网络允许时）后台缓存。纯函数，便于测试。
enum VideoPlaybackPlan: Equatable, Sendable {
    /// 包内或已缓存的本地文件。
    case local(URL)
    /// 播远程。`needsCellularConfirm`：蜂窝下手动播放前要提示约多少流量；`cacheInBackground`：同时落盘。
    case stream(needsCellularConfirm: Bool, cacheInBackground: Bool)
    case offline

    static func make(bundled: URL?, cached: URL?, network: NetworkStatus, wifiOnly: Bool) -> VideoPlaybackPlan {
        if let bundled { return .local(bundled) }
        if let cached { return .local(cached) }
        switch network {
        case .offline: return .offline
        case .unmetered: return .stream(needsCellularConfirm: false, cacheInBackground: true)
        case .metered: return .stream(needsCellularConfirm: true, cacheInBackground: !wifiOnly)
        }
    }
}

/// 视频模块的入口与依赖，GuidebookSheet 和设置页通过它取用。整合时替换 `access` 即可接入付费判断。
@MainActor
final class VideoService {
    static var shared = VideoService()

    let catalog: VideoCatalog?
    let cache: VideoCache
    let network: any NetworkStatusProviding
    let urlProvider: any VideoURLProviding
    var access: any VideoAccessChecking
    /// 点了锁定的视频时的回调（打开付费墙）。未设置时由界面给出默认提示。
    var onNeedsPaywall: ((Int) -> Void)?
    var language: () -> AppLanguage = { AppLanguage.current }

    init(catalog: VideoCatalog? = VideoCatalog.loadBundled(),
         network: any NetworkStatusProviding = PathMonitor(),
         cache: VideoCache? = nil,
         urlProvider: (any VideoURLProviding)? = nil,
         access: (any VideoAccessChecking)? = nil) {
        self.catalog = catalog
        self.network = network
        self.cache = cache ?? VideoCache(network: network)
        self.urlProvider = urlProvider ?? AuthorizedVideoURLProvider.live(version: catalog?.version ?? "v1")
        if let access {
            self.access = access
        } else if Self.debugUnlockAll {
            self.access = UnlockedVideoAccess()
        } else {
            self.access = DefaultVideoAccess()
        }
    }

    /// 调试用 `-videoUnlockAll`：只在 DEBUG 构建生效，Release 里恒为 false，不能绕过付费。
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

    func asset(chapter: Int) -> VideoAsset? {
        guard let catalog else { return nil }
        return catalog.entry(chapter: chapter)?.asset(version: catalog.version, language: language())
    }

    func title(chapter: Int) -> String? {
        catalog?.entry(chapter: chapter)?.title(for: language())
    }
}
