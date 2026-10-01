import Foundation

/// 内置视频清单 `Content/videos.json`，由 `工具/build_video_manifest.py` 生成。
struct VideoCatalog: Decodable, Sendable {
    /// 视频版本（同时是远程路径里的 `v1`）。
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

    /// 优先用 `language`；该语言的视频还没做时回落到中文。
    func resolvedLanguage(_ language: AppLanguage) -> AppLanguage? {
        if files[language.rawValue] != nil { return language }
        return files[AppLanguage.zh.rawValue] != nil ? .zh : nil
    }

    func title(for language: AppLanguage) -> String {
        titles[language.rawValue] ?? titles[AppLanguage.zh.rawValue] ?? ""
    }

    func asset(version: String, language: AppLanguage) -> VideoAsset? {
        guard let resolved = resolvedLanguage(language), let info = files[resolved.rawValue] else { return nil }
        return VideoAsset(chapter: chapter, language: resolved, version: version, info: info)
    }
}

struct VideoFile: Decodable, Sendable, Equatable, Hashable {
    let file: String
    let bytes: Int64
    let sha256: String
    let durationSec: Double
    /// 随 App 打包（免费章节）。
    let bundled: Bool
}

/// 某章某语言的一支具体视频。
struct VideoAsset: Sendable, Equatable, Hashable {
    let chapter: Int
    let language: AppLanguage
    let version: String
    let info: VideoFile

    var key: VideoKey { VideoKey(chapter: chapter, language: language) }

    /// 缓存文件名，带版本和校验和前缀：`ch02-v1-86a60009.mp4`。
    var cacheFileName: String {
        let stem = (info.file as NSString).deletingPathExtension
        return "\(stem)-\(version)-\(info.sha256.prefix(8)).mp4"
    }
}

struct VideoKey: Sendable, Hashable {
    let chapter: Int
    let language: AppLanguage
}

enum VideoFormat {
    /// 224.1 秒 → “3 分钟 44 秒” / “3 min, 44 sec”，随系统语言。
    static func duration(_ seconds: Double, locale: Locale = .current) -> String {
        let total = Int(seconds.rounded())
        return Duration.seconds(total).formatted(.units(allowed: [.minutes, .seconds], width: .abbreviated).locale(locale))
    }

    static func bytes(_ count: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: count, countStyle: .file)
    }
}

extension VideoCatalog {
    /// 包内视频文件，没有则 nil。
    func bundledURL(for asset: VideoAsset, bundle: Bundle = .main) -> URL? {
        guard asset.info.bundled else { return nil }
        let name = asset.info.file as NSString
        return bundle.url(forResource: name.deletingPathExtension, withExtension: name.pathExtension,
                          subdirectory: "\(CourseLibrary.contentDirectory)/videos/\(asset.language.rawValue)")
    }
}
