import AVFoundation
import Observation

/// 视频页的状态与播放控制。
@MainActor
@Observable
final class VideoPlayerModel {
    enum Phase: Equatable {
        case preparing
        case playing
        case failed(String)
        case unavailable(String)
    }

    private(set) var phase: Phase = .preparing
    private(set) var player: AVPlayer?

    let chapter: Int
    private let service: VideoService
    private var statusObservation: NSKeyValueObservation?
    private var startTask: Task<Void, Never>?
    /// 解密出的临时文件，关闭播放页时删除。
    private var temporaryURL: URL?

    init(chapter: Int, service: VideoService = .shared) {
        self.chapter = chapter
        self.service = service
    }

    func start() {
        startTask?.cancel()
        releasePlayer()
        phase = .preparing
        startTask = Task { await run() }
    }

    func stop() {
        startTask?.cancel()
        startTask = nil
        releasePlayer()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func releasePlayer() {
        statusObservation = nil
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        player = nil
        if let url = temporaryURL {
            service.vault.discard(url)
            temporaryURL = nil
        }
    }

    private func run() async {
        guard service.requestPlayback(chapter: chapter) else {
            phase = .unavailable(String(localized: "解锁完整版后可观看本章动画讲解。"))
            return
        }
        guard let asset = service.asset(chapter: chapter), let catalog = service.catalog else {
            phase = .unavailable(String(localized: "没有找到本章的动画讲解。"))
            return
        }
        guard let source = catalog.bundledURL(for: asset, bundle: service.bundle) else {
            phase = .failed(VideoVaultError.fileMissing.userMessage)
            return
        }
        do {
            if asset.info.isEncrypted { try await service.provisioner.ensureKey() }
            let url = try await service.vault.prepare(source: source, asset: asset)
            guard !Task.isCancelled else {
                service.vault.discard(url)
                return
            }
            temporaryURL = url
            play(url)
        } catch {
            if error is CancellationError || Task.isCancelled { return }
            switch error {
            case let error as VideoKeyError: phase = .failed(error.userMessage)
            case let error as VideoVaultError: phase = .failed(error.userMessage)
            default: phase = .failed(String(localized: "视频文件无法播放。"))
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
        releasePlayer()
        phase = .failed(String(localized: "视频文件无法播放。"))
    }
}
