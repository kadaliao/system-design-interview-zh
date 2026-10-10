import Foundation
import StoreKit

/// 向视频服务换取内容主密钥：`POST /v1/key`，body `{"signedTransaction": <Transaction.jwsRepresentation>}`。
/// 成功 `{"ok":true,"key":"<base64 32 字节>","keyVersion":1}`。

typealias VideoKeyTransport = @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)

enum VideoKeyError: Error, Equatable, Sendable {
    /// 本机没有完整版的购买凭证。
    case noPurchase
    /// 连不上服务器（离线、超时等）。
    case network
    /// 服务端拒绝了购买凭证（`error.code`，如 REVOKED / BAD_SIGNATURE）。
    case rejected(String)
    /// 服务端异常（5xx、限流、响应格式不对），附 HTTP 状态码。
    case serverError(Int)

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
        }
    }
}

struct VideoKeyClient: Sendable {
    static let defaultEndpoint = URL(string: "https://video.liaoxingyi.com/v1/key")!

    let endpoint: URL
    /// 完整版交易的 `jwsRepresentation`；没有购买凭证时返回 nil。
    let signedTransaction: @Sendable () async -> String?
    let transport: VideoKeyTransport
    let timeout: TimeInterval

    init(endpoint: URL = VideoKeyClient.defaultEndpoint,
         signedTransaction: @escaping @Sendable () async -> String? = { await VideoKeyClient.currentFullVersionJWS() },
         transport: @escaping VideoKeyTransport = VideoKeyClient.urlSessionTransport(),
         timeout: TimeInterval = 15) {
        self.endpoint = endpoint
        self.signedTransaction = signedTransaction
        self.transport = transport
        self.timeout = timeout
    }

    func fetchMasterKey() async throws -> Data {
        guard let jws = await signedTransaction() else { throw VideoKeyError.noPurchase }
        var request = URLRequest(url: endpoint, timeoutInterval: timeout)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(KeyRequest(signedTransaction: jws))
        let data: Data
        let http: HTTPURLResponse
        do {
            (data, http) = try await transport(request)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw VideoKeyError.network
        }
        let body = try? JSONDecoder().decode(KeyResponse.self, from: data)
        guard http.statusCode == 200 else {
            switch http.statusCode {
            case 400, 401, 403: throw VideoKeyError.rejected(body?.error?.code ?? "HTTP \(http.statusCode)")
            default: throw VideoKeyError.serverError(http.statusCode)
            }
        }
        guard let body, body.ok, let encoded = body.key, let key = Data(base64Encoded: encoded),
              key.count == VideoCrypto.masterKeyLength else {
            throw VideoKeyError.serverError(http.statusCode)
        }
        return key
    }

    private struct KeyRequest: Encodable { let signedTransaction: String }
    private struct KeyResponse: Decodable {
        struct Failure: Decodable { let code: String?; let message: String? }
        let ok: Bool
        let key: String?
        let keyVersion: Int?
        let error: Failure?
    }

    static func urlSessionTransport(_ session: URLSession = .shared) -> VideoKeyTransport {
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

/// 保证本机有主密钥：没有就取一次存进 Keychain；并发调用共用一次网络请求。
actor VideoKeyProvisioner {
    private let vault: VideoVault
    private let client: VideoKeyClient
    private var inflight: Task<Void, Error>?

    init(vault: VideoVault, client: VideoKeyClient = VideoKeyClient()) {
        self.vault = vault
        self.client = client
    }

    func ensureKey() async throws {
        if vault.hasKey { return }
        let task: Task<Void, Error>
        if let running = inflight {
            task = running
        } else {
            let vault = vault, client = client
            task = Task {
                let key = try await client.fetchMasterKey()
                try vault.storeKey(key)
            }
            inflight = task
        }
        defer { inflight = nil }
        try await task.value
    }

    /// 购买、恢复、启动时的后台静默获取：失败不打扰，播放时会再试。
    func provisionQuietly() async {
        try? await ensureKey()
    }
}
