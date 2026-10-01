import Foundation
import StoreKit

/// 向视频服务（Cloudflare Worker）换取短时效 token 的一整套：HTTP 客户端、token 缓存、生产用的 URL 提供者。
/// 接口规范见 `服务端/README.md` 第 2 节：`POST /v1/auth`，body `{"signedTransaction","lang"}`。

/// 发请求的抽象，测试里换成假实现，不联网。
typealias VideoAuthTransport = @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)

/// 服务端签发的 token。
struct VideoToken: Sendable, Equatable {
    let value: String
    /// token 只对这个路径前缀下的视频有效，如 `/v1/zh/`。
    let pathPrefix: String
    /// 本机时钟下的过期时间（用 ttl 推算，不受设备时间偏差影响）。
    let expiresAt: Date

    /// 临近过期（最后 `margin` 秒）就当作已过期，提前重取。
    func isValid(at date: Date, for path: String, margin: TimeInterval = 60) -> Bool {
        path.hasPrefix(pathPrefix) && date.addingTimeInterval(margin) < expiresAt
    }
}

/// `/v1/auth` 的客户端。
struct VideoAuthClient: Sendable {
    let endpoint: @Sendable () -> URL
    /// 完整版交易的 `jwsRepresentation`；没有购买凭证时返回 nil。
    let signedTransaction: @Sendable () async -> String?
    let transport: VideoAuthTransport
    let now: @Sendable () -> Date
    let timeout: TimeInterval

    init(endpoint: @escaping @Sendable () -> URL,
         signedTransaction: @escaping @Sendable () async -> String? = { await VideoAuthClient.currentFullVersionJWS() },
         transport: @escaping VideoAuthTransport = VideoAuthClient.urlSessionTransport(),
         now: @escaping @Sendable () -> Date = { Date() },
         timeout: TimeInterval = 15) {
        self.endpoint = endpoint
        self.signedTransaction = signedTransaction
        self.transport = transport
        self.now = now
        self.timeout = timeout
    }

    func fetchToken(language: AppLanguage) async throws -> VideoToken {
        guard let jws = await signedTransaction() else { throw VideoURLError.noPurchase }
        var request = URLRequest(url: endpoint(), timeoutInterval: timeout)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(AuthRequest(signedTransaction: jws, lang: language.rawValue))
        let data: Data
        let http: HTTPURLResponse
        do {
            (data, http) = try await transport(request)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw VideoURLError.network
        }
        let body = try? JSONDecoder().decode(AuthResponse.self, from: data)
        guard http.statusCode == 200 else {
            switch http.statusCode {
            case 400, 401, 403: throw VideoURLError.rejected(body?.error?.code ?? "HTTP \(http.statusCode)")
            default: throw VideoURLError.serverError(http.statusCode)
            }
        }
        guard let body, body.ok, let token = body.token, !token.isEmpty, let prefix = body.pathPrefix else {
            throw VideoURLError.serverError(http.statusCode)
        }
        let ttl = body.ttlSeconds ?? body.expiresAt.map { $0 - now().timeIntervalSince1970 } ?? 0
        guard ttl > 0 else { throw VideoURLError.serverError(http.statusCode) }
        return VideoToken(value: token, pathPrefix: prefix, expiresAt: now().addingTimeInterval(ttl))
    }

    private struct AuthRequest: Encodable { let signedTransaction: String; let lang: String }
    private struct AuthResponse: Decodable {
        struct Failure: Decodable { let code: String?; let message: String? }
        let ok: Bool
        let token: String?
        let expiresAt: Double?
        let ttlSeconds: Double?
        let pathPrefix: String?
        let error: Failure?
    }

    static func urlSessionTransport(_ session: URLSession = .shared) -> VideoAuthTransport {
        { request in
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
            return (data, http)
        }
    }

    /// 取当前有效的完整版交易 JWS。Xcode / StoreKitTest 的本地交易服务端验证不过，属预期。
    static func currentFullVersionJWS(productID: String = Entitlements.productID) async -> String? {
        for await result in Transaction.currentEntitlements {
            if case let .verified(transaction) = result, transaction.productID == productID, transaction.revocationDate == nil {
                return result.jwsRepresentation
            }
        }
        return nil
    }
}

/// token 缓存：按语言分开，过期前自动重取；同一语言并发请求共用一次网络调用。
actor VideoTokenStore {
    private let fetch: @Sendable (AppLanguage) async throws -> VideoToken
    private let now: @Sendable () -> Date
    private var tokens: [AppLanguage: VideoToken] = [:]
    private var inflight: [AppLanguage: Task<VideoToken, Error>] = [:]

    init(now: @escaping @Sendable () -> Date = { Date() },
         fetch: @escaping @Sendable (AppLanguage) async throws -> VideoToken) {
        self.fetch = fetch
        self.now = now
    }

    /// `forceRefresh`：服务端已拒绝旧 token（如下载中途过期）时丢弃缓存重取。
    func token(language: AppLanguage, path: String, forceRefresh: Bool = false) async throws -> String {
        if forceRefresh { tokens[language] = nil }
        if let cached = tokens[language], cached.isValid(at: now(), for: path) { return cached.value }
        let task: Task<VideoToken, Error>
        if let running = inflight[language] {
            task = running
        } else {
            let fetch = self.fetch
            task = Task { try await fetch(language) }
            inflight[language] = task
        }
        defer { inflight[language] = nil }
        let token = try await task.value
        tokens[language] = token
        return token.value
    }
}

/// 生产用 URL 提供者：免费章节原样返回；付费章节在地址后追加 `?token=`。
/// 缓存与播放器用同一个提供者；整文件缓存按「章节+语言」落盘，与 token 无关。
struct AuthorizedVideoURLProvider: VideoURLProviding {
    let base: any VideoURLProviding
    let isFree: @Sendable (Int) -> Bool
    let tokens: VideoTokenStore

    func playableURL(chapter: Int, language: AppLanguage) async throws -> URL {
        try await url(chapter: chapter, language: language, forceRefresh: false)
    }

    func refreshedURL(chapter: Int, language: AppLanguage) async throws -> URL {
        try await url(chapter: chapter, language: language, forceRefresh: true)
    }

    private func url(chapter: Int, language: AppLanguage, forceRefresh: Bool) async throws -> URL {
        let url = try await base.playableURL(chapter: chapter, language: language)
        if isFree(chapter) { return url }
        let token = try await tokens.token(language: language, path: url.path, forceRefresh: forceRefresh)
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        components.queryItems = (components.queryItems ?? []).filter { $0.name != "token" } + [URLQueryItem(name: "token", value: token)]
        return components.url ?? url
    }

    /// 正式配置：地址按 `VideoRegion.resolved()`（目前恒为海外源），鉴权走海外源的 `/v1/auth`。
    static func live(version: String,
                     config: @escaping @Sendable () -> VideoConfig = { VideoConfig.current() },
                     session: URLSession = .shared) -> AuthorizedVideoURLProvider {
        let client = VideoAuthClient(
            endpoint: { config().globalBase.appendingPathComponent("v1").appendingPathComponent("auth") },
            transport: VideoAuthClient.urlSessionTransport(session))
        return AuthorizedVideoURLProvider(
            base: DirectVideoURLProvider(version: version, config: config),
            isFree: { DefaultVideoAccess.freeChapters.contains($0) },
            tokens: VideoTokenStore(fetch: { try await client.fetchToken(language: $0) }))
    }
}

extension VideoURLError {
    /// 给用户看的说明。
    var userMessage: String {
        switch self {
        case .noPurchase:
            String(localized: "没有找到完整版的购买凭证。请在解锁页点「恢复购买」后重试。")
        case .network:
            String(localized: "连不上视频服务器，请检查网络后重试。")
        case .rejected:
            String(localized: "视频服务器没有通过购买验证。请点「恢复购买」，或稍后重试。")
        case .serverError:
            String(localized: "视频服务暂时不可用，请稍后重试。")
        case .unavailable:
            String(localized: "暂时拿不到视频地址，请稍后重试。")
        }
    }
}
