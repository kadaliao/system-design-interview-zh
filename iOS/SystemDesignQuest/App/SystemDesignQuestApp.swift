import SwiftUI

@main
struct SystemDesignQuestApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var store: ProgressStore?
    @State private var router = Router()
    @State private var entitlements: Entitlements
    @Environment(\.scenePhase) private var scenePhase
    private let loadError: String?

    init() {
        // -unlockAll 只在 DEBUG 构建里生效，用于截图和演示
        let entitlements = Entitlements(debugUnlockAll: ProcessInfo.processInfo.arguments.contains("-unlockAll"))
        _entitlements = State(initialValue: entitlements)
        do {
            let library = try CourseLibrary.loadBundled()
            let arguments = ProcessInfo.processInfo.arguments
            // -demo：用内存里的示例进度启动，便于截图和演示，不碰真实存档
            let store = arguments.contains("-demo")
                ? ProgressStore(library: library, fileURL: nil, entitlements: entitlements)
                : ProgressStore(library: library, entitlements: entitlements)
            if arguments.contains("-demo") { DemoData.seed(store) }
            _store = State(initialValue: store)
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    private static var isHostingUnitTests: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }

    var body: some Scene {
        WindowGroup {
            if let store {
                RootView()
                    .environment(store)
                    .environment(router)
                    .environment(entitlements)
                    .tint(Palette.greenShadow)
                    .onAppear {
                        // 单元测试把本 App 当宿主时不连真实的 StoreKit：否则它会和测试里的 SKTestSession 抢同一个进程内的 StoreKit 环境
                        if !Self.isHostingUnitTests { entitlements.start() }
                        Haptics.enabled = store.settings.hapticsEnabled
                        // store 与 App 同生命周期，直接强引用
                        store.onActivityChanged = {
                            Haptics.enabled = store.settings.hapticsEnabled
                            ReminderScheduler.reschedule(for: store)
                        }
                        ReminderScheduler.reschedule(for: store)
                    }
                    .onChange(of: scenePhase) { _, phase in
                        if phase == .background { store.saveNow() }
                        if phase == .active { ReminderScheduler.reschedule(for: store) }
                    }
            } else {
                ContentUnavailableView("课程内容加载失败", systemImage: "exclamationmark.triangle",
                                       description: Text(loadError ?? "未知错误"))
            }
        }
    }
}
