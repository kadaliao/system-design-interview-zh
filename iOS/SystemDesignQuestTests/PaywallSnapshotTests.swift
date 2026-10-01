import Foundation
import StoreKit
import StoreKitTest
import SwiftUI
import Testing
import UIKit
@testable import SystemDesignQuest

/// 把付费墙渲染成 PNG（App Store Connect 的内购审核截图用）。
/// 只在设置了环境变量 `SDQ_PAYWALL_PNG` 时运行，平时直接返回，不影响普通测试：
///   TEST_RUNNER_SDQ_PAYWALL_PNG=/tmp/paywall.png xcodebuild test -only-testing:SystemDesignQuestTests/PaywallSnapshotTests …
/// 价格来自本地的 `Products.storekit`（StoreKitTest），所以截图里是带价格、可购买状态的真实付费墙。
@Suite("付费墙截图（手动）", .serialized)
@MainActor
struct PaywallSnapshotTests {
    private static let configURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .appending(path: "SystemDesignQuest/Products.storekit")
    private static var session: SKTestSession?

    @Test func renderPaywall() async throws {
        guard let out = ProcessInfo.processInfo.environment["SDQ_PAYWALL_PNG"], !out.isEmpty else { return }

        let session = try SKTestSession(contentsOf: Self.configURL)
        session.resetToDefaultState()
        session.clearTransactions()
        session.disableDialogs = true
        Self.session = session

        let library = try CourseLibrary.loadBundled()
        let store = ProgressStore(library: library, fileURL: nil)
        let entitlements = Entitlements(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        await entitlements.loadProduct()
        #expect(entitlements.displayPrice != nil, "没有拿到价格，截图没有意义")

        let root = PaywallSheet(reason: .chapter(2))
            .environment(store)
            .environment(entitlements)
            .environment(Router())

        let size = CGSize(width: 402, height: 874) // iPhone 18 Pro 的点数尺寸，3x → 1206×2622
        let host = UIHostingController(rootView: root)
        let window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.frame = window.bounds
        host.view.layoutIfNeeded()
        try await Task.sleep(for: .seconds(1)) // 等待布局、字体和异步价格就绪

        let format = UIGraphicsImageRendererFormat()
        format.scale = 3
        format.opaque = true
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            host.view.drawHierarchy(in: CGRect(origin: .zero, size: size), afterScreenUpdates: true)
        }
        let png = try #require(image.pngData())
        try png.write(to: URL(fileURLWithPath: out))
        print("PAYWALL_PNG_WRITTEN \(out) \(Int(image.size.width * image.scale))x\(Int(image.size.height * image.scale))")
    }
}
