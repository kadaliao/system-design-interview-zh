import Foundation

/// 内容语言（课程、实验、插图、视频）。只读，跟随系统：iOS「设置 → App → 语言」可为本 App 单独指定。
/// 任何中文（简体、繁体……）用中文内容，其他语言一律英文。
enum AppLanguage: String, Codable, CaseIterable, Sendable {
    case zh, en

    static var current: AppLanguage { resolve(preferred: Locale.preferredLanguages) }

    static func resolve(preferred: [String]) -> AppLanguage {
        let first = preferred.first?.lowercased() ?? ""
        return first.hasPrefix("zh") ? .zh : .en
    }
}
