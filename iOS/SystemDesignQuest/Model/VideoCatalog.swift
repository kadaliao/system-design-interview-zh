import Foundation

/// 内置视频清单 `Content/videos.json`，由 `工具/build_video_manifest.py` 生成；只描述随包的文件。
struct VideoCatalog: Decodable, Sendable {
    /// 视频内容版本。
    let version: String
    let chapters: [VideoEntry]

    func entry(chapter: Int) -> VideoEntry? { chapters.first { $0.chapter == chapter } }

    static func loadBundled(bundle: Bundle = .main) -> VideoCatalog? {
        guard let url = bundle.url(forResource: "videos", withExtension: "json", subdirectory: CourseLibrary.contentDirectory),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? decode(data)
    }

    static func decode(_ data: Data) throws -> VideoCatalog {
        try JSONDecoder().decode(VideoCatalog.self, from: data)
    }
}

struct VideoEntry: Decodable, Sendable, Equatable {
    let chapter: Int
    let free: Bool
    let titles: [String: String]
    let files: [String: VideoFile]

    /// 选出要播的那一支：优先用 `language`，该语言的文件不可用时回落到另一种语言。
    /// `isAvailable` 判断文件是否真的在包里；两种语言都不可用时仍返回首选语言（由播放页报「文件缺失」）。
    func asset(language: AppLanguage, isAvailable: (VideoAsset) -> Bool = { _ in true }) -> VideoAsset? {
        let order = [language] + AppLanguage.allCases.filter { $0 != language }
        let candidates = order.compactMap { lang in
            files[lang.rawValue].map { VideoAsset(chapter: chapter, language: lang, info: $0) }
        }
        return candidates.first(where: isAvailable) ?? candidates.first
    }

    func title(for language: AppLanguage) -> String {
        titles[language.rawValue] ?? titles[AppLanguage.zh.rawValue] ?? ""
    }
}

/// 随包的一支视频文件：免费章节是明文 `chNN.mp4`，付费章节是加密的 `chNN.sdqv`。
struct VideoFile: Decodable, Sendable, Equatable, Hashable {
    let file: String
    let durationSec: Double

    var isEncrypted: Bool { (file as NSString).pathExtension.lowercased() == VideoCrypto.fileExtension }
}

/// 某章某语言的一支具体视频。
struct VideoAsset: Sendable, Equatable, Hashable {
    let chapter: Int
    let language: AppLanguage
    let info: VideoFile

    /// 加解密时绑定语言和章节的标签，如 `zh/ch07`。
    var cryptoLabel: String { VideoCrypto.label(language: language, chapter: chapter) }
}

enum VideoFormat {
    /// 224.1 秒 → “3 分钟 44 秒” / “3 min, 44 sec”，随系统语言。
    static func duration(_ seconds: Double, locale: Locale = .current) -> String {
        let total = Int(seconds.rounded())
        return Duration.seconds(total).formatted(.units(allowed: [.minutes, .seconds], width: .abbreviated).locale(locale))
    }
}

extension VideoCatalog {
    /// 包内视频文件，没有则 nil。
    func bundledURL(for asset: VideoAsset, bundle: Bundle = .main) -> URL? {
        let name = asset.info.file as NSString
        return bundle.url(forResource: name.deletingPathExtension, withExtension: name.pathExtension,
                          subdirectory: "\(CourseLibrary.contentDirectory)/videos/\(asset.language.rawValue)")
    }
}
