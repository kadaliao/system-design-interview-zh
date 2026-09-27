import SwiftUI

@main
struct SystemDesignQuestApp: App {
    @State private var store: ProgressStore?
    @State private var router = Router()
    @Environment(\.scenePhase) private var scenePhase
    private let loadError: String?

    init() {
        do {
            let library = try CourseLibrary.loadBundled()
            let arguments = ProcessInfo.processInfo.arguments
            // -demo：用内存里的示例进度启动，便于截图和演示，不碰真实存档
            let store = arguments.contains("-demo")
                ? ProgressStore(library: library, fileURL: nil)
                : ProgressStore(library: library)
            if arguments.contains("-demo") { DemoData.seed(store) }
            _store = State(initialValue: store)
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    var body: some Scene {
        WindowGroup {
            if let store {
                RootView()
                    .environment(store)
                    .environment(router)
                    .tint(Palette.greenShadow)
                    .onAppear {
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
