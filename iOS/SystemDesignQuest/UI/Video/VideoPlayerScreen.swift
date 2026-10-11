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

/// 用 UIKit 把播放页直接盖在当前最上层的页面上。
/// 不用 SwiftUI 的 fullScreenCover：播放页从单元指南（sheet）里打开，转屏时 sheet 重排会让 SwiftUI 把
/// cover 拆掉重建，播放会从头开始、横屏也会被恢复成竖屏。UIKit 呈现的页面不受上层 SwiftUI 重建影响。
@MainActor
enum VideoPresenter {
    static func present(chapter: Int, title: String) {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              var top = scene.keyWindow?.rootViewController else { return }
        while let presented = top.presentedViewController, !presented.isBeingDismissed { top = presented }
        let host = UIHostingController<VideoPlayerScreen>(rootView: VideoPlayerScreen(chapter: chapter, title: title))
        host.rootView.onClose = { [weak host] in host?.presentingViewController?.dismiss(animated: true) }
        host.modalPresentationStyle = .fullScreen
        host.view.backgroundColor = .black
        top.present(host, animated: true)
    }
}

/// 动画讲解播放页，全屏呈现；进入时放开横屏，退出时恢复竖屏。
struct VideoPlayerScreen: View {
    let chapter: Int
    let title: String
    @State private var model: VideoPlayerModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    /// 由呈现方提供的关闭动作（UIKit 呈现时用）；为空时用 SwiftUI 的 dismiss。
    var onClose: (() -> Void)?
    @State private var visible = false
    @State private var started = false

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
        .overlay(alignment: verticalSizeClass == .compact ? .top : .topLeading) {
            // 竖屏：左上角（上方是黑边，不挡画面）；横屏：顶部居中，避开画面自带的左上角章节标签、
            // 右上角进度点，以及系统播放控件的左上角关闭/标题
            HStack(spacing: 10) {
                overlayButton("xmark", label: "关闭") {
                    visible = false
                    model.stop()
                    started = false
                    OrientationController.restorePortrait()
                    if let onClose { onClose() } else { dismiss() }
                }
                overlayButton("rotate.right", label: "旋转屏幕") { OrientationController.toggleLandscape() }
            }
            .padding(.leading, verticalSizeClass == .compact ? 0 : 16)
            .padding(.top, 8)
        }
        .onAppear {
            visible = true
            OrientationController.allowLandscape()
            if !started {
                started = true
                model.start()
            }
        }
        .onDisappear {
            // 转屏时上层的 sheet 会重排，SwiftUI 可能把本页先 onDisappear 再 onAppear。
            // 稍等一下再判断是否真的离开，避免误停播放、误恢复竖屏（真机上表现为点了旋转又竖回去、视频从头播）。
            visible = false
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(600))
                guard !visible else { return }
                model.stop()
                started = false
                OrientationController.restorePortrait()
            }
        }
    }

    private func overlayButton(_ systemName: String, label: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(Circle().fill(.black.opacity(0.55)))
        }
        .accessibilityLabel(label)
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
        case let .failed(text):
            message(icon: "exclamationmark.triangle", text: text, button: "重试") { model.start() }
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
