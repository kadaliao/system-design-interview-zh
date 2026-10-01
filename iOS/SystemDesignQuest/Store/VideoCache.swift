import CryptoKit
import Foundation

enum VideoCacheError: Error, Equatable, Sendable {
    case offline
    /// 蜂窝网络且设置为仅 Wi-Fi 下载。
    case cellularRestricted
    case http(Int)
    case sizeMismatch
    case checksumMismatch
    case network(String)
    case io(String)
}

enum VideoCacheState: Equatable, Sendable {
    case notCached
    case downloading(Double)
    case cached(URL)
    case failed(VideoCacheError)
}

/// 视频整文件缓存：Caches/Videos/{lang}/chNN-v1-xxxxxxxx.mp4。
/// 下载 → 临时文件 → 大小与 sha256 校验 → 原子改名落盘。同一支视频的并发请求共用一次下载。
actor VideoCache {
    enum Trigger: Sendable {
        /// 播放时后台顺带缓存：受「仅 Wi-Fi」限制。
        case automatic
        /// 用户明确点了下载。
        case manual
    }

    private let root: URL
    private let session: URLSession
    private let network: any NetworkStatusProviding
    private let wifiOnly: @Sendable () -> Bool
    private let maxAttempts: Int
    private let retryDelay: Duration
    private let fileManager = FileManager.default

    private var tasks: [VideoKey: Task<URL, Error>] = [:]
    private var states: [VideoKey: VideoCacheState] = [:]
    private var observers: [VideoKey: [UUID: AsyncStream<VideoCacheState>.Continuation]] = [:]

    init(root: URL = VideoCache.defaultRoot,
         session: URLSession = .shared,
         network: any NetworkStatusProviding,
         wifiOnly: @escaping @Sendable () -> Bool = { VideoCache.wifiOnlySetting },
         maxAttempts: Int = 3,
         retryDelay: Duration = .seconds(2)) {
        self.root = root
        self.session = session
        self.network = network
        self.wifiOnly = wifiOnly
        self.maxAttempts = max(1, maxAttempts)
        self.retryDelay = retryDelay
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        Self.removePartials(in: root)
    }

    // MARK: 设置

    static let wifiOnlyKey = "videoWifiOnly"
    /// 默认只在 Wi-Fi 下自动缓存。
    static var wifiOnlySetting: Bool {
        UserDefaults.standard.object(forKey: wifiOnlyKey) as? Bool ?? true
    }

    static var defaultRoot: URL {
        URL.cachesDirectory.appending(path: "Videos", directoryHint: .isDirectory)
    }

    // MARK: 查询

    func fileURL(for asset: VideoAsset) -> URL {
        root.appending(path: asset.language.rawValue, directoryHint: .isDirectory).appending(path: asset.cacheFileName)
    }

    /// 已缓存且大小正确的本地文件。
    func cachedURL(for asset: VideoAsset) -> URL? {
        let url = fileURL(for: asset)
        guard let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize, Int64(size) == asset.info.bytes else { return nil }
        return url
    }

    func state(for asset: VideoAsset) -> VideoCacheState {
        if let url = cachedURL(for: asset) { return .cached(url) }
        return states[asset.key] ?? .notCached
    }

    /// 订阅状态变化，先收到当前状态。
    func updates(for asset: VideoAsset) -> AsyncStream<VideoCacheState> {
        let key = asset.key
        let current = state(for: asset)
        let id = UUID()
        let (stream, continuation) = AsyncStream<VideoCacheState>.makeStream(bufferingPolicy: .bufferingNewest(1))
        continuation.yield(current)
        observers[key, default: [:]][id] = continuation
        continuation.onTermination = { [weak self] _ in
            Task { await self?.removeObserver(key: key, id: id) }
        }
        return stream
    }

    private func removeObserver(key: VideoKey, id: UUID) {
        observers[key]?[id] = nil
    }

    private func publish(_ state: VideoCacheState, for key: VideoKey) {
        states[key] = state
        for continuation in observers[key]?.values ?? [:].values { continuation.yield(state) }
    }

    // MARK: 下载

    /// 当前网络和设置下，后台自动缓存是否允许。
    func automaticCachingAllowed() -> Bool {
        switch network.status {
        case .offline: false
        case .unmetered: true
        case .metered: !wifiOnly()
        }
    }

    /// 缓存一支视频并返回本地文件。已缓存直接返回；正在下载则等同一次下载。
    @discardableResult
    func cache(_ asset: VideoAsset, from remote: URL, trigger: Trigger,
               refreshURL: (@Sendable () async throws -> URL)? = nil) async throws -> URL {
        if let url = cachedURL(for: asset) { return url }
        if let task = tasks[asset.key] { return try await task.value }
        switch network.status {
        case .offline:
            publish(.failed(.offline), for: asset.key)
            throw VideoCacheError.offline
        case .metered where trigger == .automatic && wifiOnly():
            publish(.failed(.cellularRestricted), for: asset.key)
            throw VideoCacheError.cellularRestricted
        default: break
        }
        let allowsMetered = trigger == .manual || !wifiOnly()
        let task = Task { try await self.download(asset, from: remote, allowsMetered: allowsMetered, refreshURL: refreshURL) }
        tasks[asset.key] = task
        publish(.downloading(0), for: asset.key)
        return try await task.value
    }

    func cancel(_ asset: VideoAsset) {
        tasks[asset.key]?.cancel()
    }

    private func download(_ asset: VideoAsset, from remote: URL, allowsMetered: Bool,
                          refreshURL: (@Sendable () async throws -> URL)?) async throws -> URL {
        let key = asset.key
        defer { tasks[key] = nil }
        do {
            let url = try await downloadWithRetry(asset, from: remote, allowsMetered: allowsMetered, refreshURL: refreshURL)
            publish(.cached(url), for: key)
            return url
        } catch is CancellationError {
            publish(.notCached, for: key)
            throw CancellationError()
        } catch {
            let mapped = Self.map(error)
            publish(.failed(mapped), for: key)
            throw mapped
        }
    }

    /// `refreshURL`：下载中途 token 过期（401/403）时换一个新地址重试，不沿用旧的续传数据。
    private func downloadWithRetry(_ asset: VideoAsset, from remote: URL, allowsMetered: Bool,
                                   refreshURL: (@Sendable () async throws -> URL)?) async throws -> URL {
        var remote = remote
        var attempt = 0
        var resumeData: Data?
        while true {
            attempt += 1
            try Task.checkCancellation()
            do {
                return try await downloadOnce(asset, from: remote, allowsMetered: allowsMetered, resumeData: resumeData)
            } catch {
                if Task.isCancelled || (error as? URLError)?.code == .cancelled { throw CancellationError() }
                if let refreshURL, attempt < maxAttempts, case let VideoCacheError.http(code) = error, code == 401 || code == 403 {
                    remote = try await refreshURL()
                    resumeData = nil
                    continue
                }
                guard attempt < maxAttempts, Self.isRetryable(error) else { throw error }
                resumeData = ((error as? URLError)?.userInfo[NSURLSessionDownloadTaskResumeData]) as? Data
                try await Task.sleep(for: retryDelay)
            }
        }
    }

    private func downloadOnce(_ asset: VideoAsset, from remote: URL, allowsMetered: Bool, resumeData: Data?) async throws -> URL {
        let key = asset.key
        let progress = ProgressRelay { [weak self] fraction in
            Task { await self?.publishProgress(fraction, for: key) }
        }
        let tempURL: URL
        let response: URLResponse
        if let resumeData {
            (tempURL, response) = try await session.download(resumeFrom: resumeData, delegate: progress)
        } else {
            var request = URLRequest(url: remote)
            request.allowsExpensiveNetworkAccess = allowsMetered
            request.allowsConstrainedNetworkAccess = allowsMetered
            request.allowsCellularAccess = allowsMetered
            (tempURL, response) = try await session.download(for: request, delegate: progress)
        }
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            try? fileManager.removeItem(at: tempURL)
            throw VideoCacheError.http(http.statusCode)
        }
        return try finalize(tempURL, asset: asset)
    }

    private func publishProgress(_ fraction: Double, for key: VideoKey) {
        guard tasks[key] != nil else { return }
        publish(.downloading(min(max(fraction, 0), 1)), for: key)
    }

    /// 校验并原子落盘。
    private func finalize(_ tempURL: URL, asset: VideoAsset) throws -> URL {
        let final = fileURL(for: asset)
        let dir = final.deletingLastPathComponent()
        do {
            try fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
            let part = dir.appending(path: ".\(UUID().uuidString).part")
            try fileManager.moveItem(at: tempURL, to: part)
            let size = (try part.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? -1
            guard Int64(size) == asset.info.bytes else {
                try? fileManager.removeItem(at: part)
                throw VideoCacheError.sizeMismatch
            }
            guard try Self.sha256(of: part) == asset.info.sha256 else {
                try? fileManager.removeItem(at: part)
                throw VideoCacheError.checksumMismatch
            }
            if fileManager.fileExists(atPath: final.path) { try fileManager.removeItem(at: final) }
            try fileManager.moveItem(at: part, to: final)
            removeStale(in: dir, keeping: final, chapterStem: (asset.info.file as NSString).deletingPathExtension)
            return final
        } catch let error as VideoCacheError {
            throw error
        } catch {
            throw VideoCacheError.io(error.localizedDescription)
        }
    }

    /// 同一章旧版本的缓存文件。
    private func removeStale(in dir: URL, keeping: URL, chapterStem: String) {
        let names = (try? fileManager.contentsOfDirectory(atPath: dir.path)) ?? []
        for name in names where name.hasPrefix(chapterStem + "-") && name != keeping.lastPathComponent {
            try? fileManager.removeItem(at: dir.appending(path: name))
        }
    }

    // MARK: 占用与清除

    func totalBytes() -> Int64 {
        guard let enumerator = fileManager.enumerator(at: root, includingPropertiesForKeys: [.fileSizeKey]) else { return 0 }
        var total: Int64 = 0
        for case let url as URL in enumerator where !url.lastPathComponent.hasSuffix(".part") {
            total += Int64((try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0)
        }
        return total
    }

    /// 取消所有下载并清空缓存目录。
    func clearAll() async {
        let running = tasks
        for task in running.values { task.cancel() }
        for task in running.values { _ = try? await task.value }
        try? fileManager.removeItem(at: root)
        try? fileManager.createDirectory(at: root, withIntermediateDirectories: true)
        for key in Set(states.keys).union(running.keys) { publish(.notCached, for: key) }
        states.removeAll()
    }

    func clear(_ asset: VideoAsset) {
        tasks[asset.key]?.cancel()
        try? fileManager.removeItem(at: fileURL(for: asset))
        publish(.notCached, for: asset.key)
    }

    // MARK: 工具

    private static func removePartials(in root: URL) {
        guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { return }
        for case let url as URL in enumerator where url.lastPathComponent.hasSuffix(".part") {
            try? FileManager.default.removeItem(at: url)
        }
    }

    static func sha256(of url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty { hasher.update(data: chunk) }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private static func isRetryable(_ error: Error) -> Bool {
        if let cache = error as? VideoCacheError {
            switch cache {
            case let .http(code): return code >= 500 || code == 408 || code == 429
            default: return false
            }
        }
        return error is URLError
    }

    private static func map(_ error: Error) -> VideoCacheError {
        if let error = error as? VideoCacheError { return error }
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .dataNotAllowed, .internationalRoamingOff: return .offline
            default: return .network(urlError.localizedDescription)
            }
        }
        return .io(error.localizedDescription)
    }
}

/// 把下载进度从 URLSession 的任务代理回调转成闭包。
private final class ProgressRelay: NSObject, URLSessionDownloadDelegate, Sendable {
    private let onProgress: @Sendable (Double) -> Void
    init(_ onProgress: @escaping @Sendable (Double) -> Void) { self.onProgress = onProgress }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard totalBytesExpectedToWrite > 0 else { return }
        onProgress(Double(totalBytesWritten) / Double(totalBytesExpectedToWrite))
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}
}
