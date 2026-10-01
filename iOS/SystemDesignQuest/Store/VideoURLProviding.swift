import Foundation

/// 给定章节与语言，返回可播放的远程地址。付费视频的地址之后会带服务端签发的短时效 `token`。
protocol VideoURLProviding: Sendable {
    func playableURL(chapter: Int, language: AppLanguage) async throws -> URL
    /// 旧地址被服务端拒绝（token 过期）后重新取一个；默认等同 `playableURL`。
    func refreshedURL(chapter: Int, language: AppLanguage) async throws -> URL
}

extension VideoURLProviding {
    func refreshedURL(chapter: Int, language: AppLanguage) async throws -> URL {
        try await playableURL(chapter: chapter, language: language)
    }
}

enum VideoURLError: Error, Equatable, Sendable {
    case unavailable
    /// 本机没有完整版的购买凭证。
    case noPurchase
    /// 连不上服务器（离线、超时等）。
    case network
    /// 服务端拒绝了购买凭证（`error.code`，如 REVOKED / BAD_SIGNATURE）。
    case rejected(String)
    /// 服务端异常（5xx、限流、响应格式不对），附 HTTP 状态码。
    case serverError(Int)
}

/// 默认实现：不签名，直接按地区拼地址。
struct DirectVideoURLProvider: VideoURLProviding {
    let config: @Sendable () -> VideoConfig
    let version: String
    let region: @Sendable () async -> VideoRegion

    init(version: String,
         config: @escaping @Sendable () -> VideoConfig = { VideoConfig.current() },
         region: @escaping @Sendable () async -> VideoRegion = { await VideoRegion.resolved() }) {
        self.version = version
        self.config = config
        self.region = region
    }

    func playableURL(chapter: Int, language: AppLanguage) async throws -> URL {
        config().url(chapter: chapter, language: language, version: version, region: await region())
    }
}

/// 签名扩展点：在另一个 provider 的结果上追加 `token` 查询参数。免费章节不取 token。
struct TokenVideoURLProvider: VideoURLProviding {
    let base: any VideoURLProviding
    let isFree: @Sendable (Int) -> Bool
    /// 向签发服务要 token，可能异步、可能失败。
    let fetchToken: @Sendable (_ chapter: Int, _ language: AppLanguage) async throws -> String

    func playableURL(chapter: Int, language: AppLanguage) async throws -> URL {
        let url = try await base.playableURL(chapter: chapter, language: language)
        if isFree(chapter) { return url }
        let token = try await fetchToken(chapter, language)
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        components.queryItems = (components.queryItems ?? []) + [URLQueryItem(name: "token", value: token)]
        return components.url ?? url
    }
}

/// 测试用：固定返回一个地址或抛错。
struct MockVideoURLProvider: VideoURLProviding {
    let result: Result<URL, VideoURLError>
    init(_ result: Result<URL, VideoURLError>) { self.result = result }

    func playableURL(chapter: Int, language: AppLanguage) async throws -> URL {
        try result.get()
    }
}
