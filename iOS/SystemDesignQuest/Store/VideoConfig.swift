import Foundation
import StoreKit

/// 视频所在地区，决定走国内 CDN 还是海外源。按 App Store 店面判断，不按语言。
enum VideoRegion: String, Sendable {
    case mainlandChina, overseas

    static func from(countryCode: String?) -> VideoRegion {
        countryCode?.uppercased() == "CHN" ? .mainlandChina : .overseas
    }

    /// 暂不做大陆市场：为 false 时 `resolved()` 恒走海外源，即使店面是 CHN 也不会崩。国内源就绪后改为 true。
    static let mainlandRoutingEnabled = false

    static func resolved() async -> VideoRegion {
        mainlandRoutingEnabled ? await current() : .overseas
    }

    /// 取当前 App Store 店面国家码（`CHN` 为大陆）；拿不到店面（如未登录的模拟器）时看系统地区是否为 CN。
    static func current() async -> VideoRegion {
        if let storefront = await Storefront.current { return from(countryCode: storefront.countryCode) }
        return Locale.current.region?.identifier == "CN" ? .mainlandChina : .overseas
    }
}

/// 视频源的基础地址。
///
/// 需要用户填写：下面两个占位地址换成真实的 CDN 域名。优先级（高到低）：
/// 1. 远程小配置（`updateFromRemote`，上次成功拉到的值存在 UserDefaults）
/// 2. Info.plist 的 `VideoBaseURLCN` / `VideoBaseURLGlobal`
/// 3. 下面的占位常量
/// 路径约定：`{base}/v1/{lang}/chNN.mp4`。
struct VideoConfig: Sendable, Equatable {
    static let placeholderCN = URL(string: "https://video-cn.liaoxingyi.com/")!
    static let placeholderGlobal = URL(string: "https://video.liaoxingyi.com/")!

    static let infoPlistKeyCN = "VideoBaseURLCN"
    static let infoPlistKeyGlobal = "VideoBaseURLGlobal"
    static let infoPlistKeyRemoteConfig = "VideoRemoteConfigURL"
    static let remoteDefaultsKey = "videoRemoteConfig"

    var cnBase: URL
    var globalBase: URL

    init(cnBase: URL = placeholderCN, globalBase: URL = placeholderGlobal) {
        self.cnBase = cnBase
        self.globalBase = globalBase
    }

    func baseURL(for region: VideoRegion) -> URL {
        region == .mainlandChina ? cnBase : globalBase
    }

    func url(chapter: Int, language: AppLanguage, version: String, region: VideoRegion) -> URL {
        baseURL(for: region)
            .appendingPathComponent(version)
            .appendingPathComponent(language.rawValue)
            .appendingPathComponent(String(format: "ch%02d.mp4", chapter))
    }

    static func current(bundle: Bundle = .main, defaults: UserDefaults = .standard) -> VideoConfig {
        var config = VideoConfig()
        func url(_ any: Any?) -> URL? { (any as? String).flatMap { URL(string: $0) } }
        if let u = url(bundle.object(forInfoDictionaryKey: infoPlistKeyCN)) { config.cnBase = u }
        if let u = url(bundle.object(forInfoDictionaryKey: infoPlistKeyGlobal)) { config.globalBase = u }
        if let data = defaults.data(forKey: remoteDefaultsKey), let remote = try? parseRemote(data) {
            config.cnBase = remote.cnBase
            config.globalBase = remote.globalBase
        }
        return config
    }

    /// 远程小配置格式：`{"cn": "https://…/", "global": "https://…/"}`，缺的字段沿用现有值。
    static func parseRemote(_ data: Data, base: VideoConfig = VideoConfig()) throws -> VideoConfig {
        struct Payload: Decodable { let cn: URL?; let global: URL? }
        let payload = try JSONDecoder().decode(Payload.self, from: data)
        return VideoConfig(cnBase: payload.cn ?? base.cnBase, globalBase: payload.global ?? base.globalBase)
    }

    /// 启动时调用的扩展点：从 Info.plist 的 `VideoRemoteConfigURL` 拉远程配置，成功后存本地，下次起生效；失败静默。
    static func updateFromRemote(bundle: Bundle = .main, defaults: UserDefaults = .standard,
                                 session: URLSession = .shared) async {
        guard let string = bundle.object(forInfoDictionaryKey: infoPlistKeyRemoteConfig) as? String,
              let url = URL(string: string),
              let (data, response) = try? await session.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200,
              (try? parseRemote(data)) != nil else { return }
        defaults.set(data, forKey: remoteDefaultsKey)
    }
}
