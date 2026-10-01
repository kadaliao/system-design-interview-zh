import AVKit
import SwiftUI

/// 系统播放器的 SwiftUI 封装：倍速、画中画、AirPlay 都用系统自带的。
struct SystemVideoPlayer: UIViewControllerRepresentable {
    let player: AVPlayer

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        controller.player = player
        controller.allowsPictureInPicturePlayback = true
        controller.entersFullScreenWhenPlaybackBegins = false
        return controller
    }

    func updateUIViewController(_ controller: AVPlayerViewController, context: Context) {
        if controller.player !== player { controller.player = player }
    }
}

/// 动画讲解播放页，全屏呈现；进入时放开横屏，退出时恢复竖屏。
struct VideoPlayerScreen: View {
    let chapter: Int
    let title: String
    @State private var model: VideoPlayerModel
    @Environment(\.dismiss) private var dismiss

    init(chapter: Int, title: String) {
        self.chapter = chapter
        self.title = title
        _model = State(initialValue: VideoPlayerModel(chapter: chapter))
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            content
        }
        .overlay(alignment: .topLeading) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(.black.opacity(0.55)))
            }
            .accessibilityLabel("关闭")
            .padding(.leading, 16)
            .padding(.top, 8)
        }
        .onAppear {
            OrientationController.allowLandscape()
            model.start()
        }
        .onDisappear {
            model.stop()
            OrientationController.restorePortrait()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .preparing:
            VStack(spacing: 14) {
                ProgressView().tint(.white).controlSize(.large)
                Text("正在加载").font(.rounded(15, .bold)).foregroundStyle(.white.opacity(0.8))
            }
        case .playing:
            if let player = model.player {
                SystemVideoPlayer(player: player).ignoresSafeArea()
            }
        case let .confirmCellular(bytes):
            message(
                icon: "antenna.radiowaves.left.and.right",
                text: String(localized: "当前使用蜂窝网络，观看本章约消耗 \(VideoFormat.bytes(bytes)) 流量。"),
                button: "继续观看") { model.start(confirmedCellular: true) }
        case let .failed(text):
            message(icon: "wifi.exclamationmark", text: text, button: "重试") { model.start() }
        case let .unavailable(text):
            message(icon: "lock.fill", text: text, button: nil, action: {})
        }
    }

    private func message(icon: String, text: String, button: LocalizedStringKey?, action: @escaping () -> Void) -> some View {
        VStack(spacing: 16) {
            Image(systemName: icon).font(.system(size: 36, weight: .bold)).foregroundStyle(.white.opacity(0.9))
            Text(title).font(.rounded(17, .heavy)).foregroundStyle(.white)
            Text(text)
                .font(.rounded(15))
                .foregroundStyle(.white.opacity(0.8))
                .multilineTextAlignment(.center)
            if let button {
                Button(button, action: action)
                    .buttonStyle(.borderedProminent)
                    .tint(Palette.green)
            }
        }
        .padding(32)
    }
}
