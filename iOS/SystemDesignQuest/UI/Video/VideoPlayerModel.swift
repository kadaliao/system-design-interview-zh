import AVFoundation
import Observation

/// 视频页的状态与播放控制。
@MainActor
@Observable
final class VideoPlayerModel {
    enum Phase: Equatable {
        case preparing
        /// 蜂窝网络下手动播放前的流量提示。
        case confirmCellular(bytes: Int64)
        case playing
        case failed(String)
        case unavailable(String)
    }

    private(set) var phase: Phase = .preparing
    private(set) var player: AVPlayer?
    /// 播的是本地文件还是远程（用于提示文案）。
    private(set) var isLocal = false

    let chapter: Int
    private let service: VideoService
    private var statusObservation: NSKeyValueObservation?
    private var startTask: Task<Void, Never>?

    init(chapter: Int, service: VideoService = .shared) {
        self.chapter = chapter
        self.service = service
    }

    func start(confirmedCellular: Bool = false) {
        startTask?.cancel()
        phase = .preparing
        startTask = Task { await run(confirmedCellular: confirmedCellular) }
    }

    func stop() {
        startTask?.cancel()
        statusObservation = nil
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        player = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func run(confirmedCellular: Bool) async {
        guard service.requestPlayback(chapter: chapter) else {
            phase = .unavailable(String(localized: "解锁完整版后可观看本章动画讲解。"))
            return
        }
        guard let asset = service.asset(chapter: chapter), let catalog = service.catalog else {
            phase = .unavailable(String(localized: "没有找到本章的动画讲解。"))
            return
        }
        let bundled = catalog.bundledURL(for: asset)
        let cached = bundled == nil ? await service.cache.cachedURL(for: asset) : nil
        let plan = VideoPlaybackPlan.make(bundled: bundled, cached: cached, network: service.network.status,
                                          wifiOnly: VideoCache.wifiOnlySetting)
        switch plan {
        case let .local(url):
            isLocal = true
            play(url)
        case .offline:
            phase = .failed(String(localized: "当前没有网络，这一章的视频还没有缓存。联网后再来看吧。"))
        case let .stream(needsConfirm, cacheInBackground):
            if needsConfirm && !confirmedCellular {
                phase = .confirmCellular(bytes: asset.info.bytes)
                return
            }
            do {
                let url = try await service.urlProvider.playableURL(chapter: chapter, language: asset.language)
                guard !Task.isCancelled else { return }
                isLocal = false
                play(url)
                if cacheInBackground {
                    // 后台整文件落盘，供下次播本地；不会切换正在播放的 item。
                    let cache = service.cache
                    let provider = service.urlProvider
                    let chapter = chapter
                    Task.detached {
                        _ = try? await cache.cache(asset, from: url, trigger: .automatic, refreshURL: {
                            try await provider.refreshedURL(chapter: chapter, language: asset.language)
                        })
                    }
                }
            } catch {
                if error is CancellationError { return }
                phase = .failed((error as? VideoURLError ?? .unavailable).userMessage)
            }
        }
    }

    private func play(_ url: URL) {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .moviePlayback)
        try? session.setActive(true)
        let item = AVPlayerItem(url: url)
        statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            let status = item.status
            Task { @MainActor in self?.handle(status) }
        }
        let player = AVPlayer(playerItem: item)
        self.player = player
        phase = .playing
        player.play()
    }

    private func handle(_ status: AVPlayerItem.Status) {
        guard status == .failed else { return }
        let local = isLocal
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        player = nil
        statusObservation = nil
        phase = .failed(local ? String(localized: "视频文件无法播放。") : String(localized: "视频加载失败，请检查网络后重试。"))
    }
}
