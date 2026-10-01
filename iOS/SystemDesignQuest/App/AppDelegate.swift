import SwiftUI
import UIKit

/// 界面方向：iPhone 默认只允许竖屏，只有视频页临时放开横屏；iPad 不受限。
@MainActor
enum OrientationController {
    private static var isPhone: Bool { UIDevice.current.userInterfaceIdiom == .phone }
    private static var restingMask: UIInterfaceOrientationMask { isPhone ? .portrait : .all }

    static var mask: UIInterfaceOrientationMask = restingMask

    static func allowLandscape() {
        guard isPhone else { return }
        apply(.allButUpsideDown)
    }

    static func restorePortrait() {
        guard isPhone else { return }
        apply(.portrait)
    }

    private static func apply(_ newMask: UIInterfaceOrientationMask) {
        mask = newMask
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
        var top = scene.keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        top?.setNeedsUpdateOfSupportedInterfaceOrientations()
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: newMask)) { _ in }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        #if DEBUG
        // 调试：`-openVideo 2` 启动后直接打开第 2 章的视频页（验证播放用，不经过指南页）
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-openVideo"), i + 1 < args.count, let chapter = Int(args[i + 1]) {
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(4))
                guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
                      let root = scene.keyWindow?.rootViewController else { return }
                let host = UIHostingController(rootView: VideoPlayerScreen(chapter: chapter, title: String(localized: "第 \(chapter) 章")))
                host.modalPresentationStyle = .fullScreen
                root.present(host, animated: false)
            }
        }
        #endif
        return true
    }

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        MainActor.assumeIsolated { OrientationController.mask }
    }
}
