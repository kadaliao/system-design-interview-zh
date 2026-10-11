import SwiftUI
import UIKit

/// 界面方向：iPhone 默认只允许竖屏，只有视频页临时放开横屏；iPad 不受限。
@MainActor
enum OrientationController {
    private static var isPhone: Bool { UIDevice.current.userInterfaceIdiom == .phone }
    private static var restingMask: UIInterfaceOrientationMask { isPhone ? .portrait : .all }

    static var mask: UIInterfaceOrientationMask = restingMask

    /// 「旋转」按钮锁定的方向；nil 表示跟随手机自动旋转。
    private(set) static var manualLock: UIInterfaceOrientationMask?
    private static var deviceObserver: NSObjectProtocol?

    static func allowLandscape() {
        guard isPhone else { return }
        manualLock = nil
        startWatchingDevice()
        apply(.allButUpsideDown)
    }

    static func restorePortrait() {
        guard isPhone else { return }
        manualLock = nil
        stopWatchingDevice()
        apply(.portrait)
    }

    /// 手动切换横竖屏（视频页的「旋转」按钮）：竖屏 → 横屏，横屏 → 竖屏。
    /// 锁定到目标方向，直到手机的实际朝向也转到同一方向时才解锁、恢复自动旋转。
    /// 不能转完马上放开：手机还竖着拿时一放开，系统会按实际朝向立刻转回竖屏。
    static func toggleLandscape() {
        guard isPhone,
              let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
        let lock: UIInterfaceOrientationMask = scene.effectiveGeometry.interfaceOrientation.isLandscape ? .portrait : .landscape
        manualLock = lock
        mask = lock
        var top = scene.keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        top?.setNeedsUpdateOfSupportedInterfaceOrientations()
        // 横屏优先转到「刘海在左」（landscapeRight），之后翻转手机仍可在左右横屏之间切换
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: lock == .landscape ? .landscapeRight : .portrait)) { _ in }
    }

    /// 手机实际朝向与锁定方向一致时即可解锁：此时界面已与手机朝向相同，解锁不会引起跳转。
    nonisolated static func shouldReleaseLock(_ lock: UIInterfaceOrientationMask, device: UIDeviceOrientation) -> Bool {
        if lock == .landscape { return device.isLandscape }
        if lock == .portrait { return device == .portrait }
        return false
    }

    private static func startWatchingDevice() {
        guard deviceObserver == nil else { return }
        UIDevice.current.beginGeneratingDeviceOrientationNotifications()
        deviceObserver = NotificationCenter.default.addObserver(
            forName: UIDevice.orientationDidChangeNotification, object: nil, queue: .main
        ) { _ in
            MainActor.assumeIsolated {
                guard let lock = manualLock, shouldReleaseLock(lock, device: UIDevice.current.orientation) else { return }
                manualLock = nil
                apply(.allButUpsideDown)
            }
        }
    }

    private static func stopWatchingDevice() {
        guard let deviceObserver else { return }
        NotificationCenter.default.removeObserver(deviceObserver)
        self.deviceObserver = nil
        UIDevice.current.endGeneratingDeviceOrientationNotifications()
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
