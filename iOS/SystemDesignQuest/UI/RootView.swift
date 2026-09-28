import SwiftUI

struct RootView: View {
    @Environment(ProgressStore.self) private var store
    @Environment(Router.self) private var router

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.selectedTab) {
            Tab("学习", systemImage: "house.fill", value: Router.Tab.learn) {
                PathScreen()
            }
            Tab("练习", systemImage: "dumbbell.fill", value: Router.Tab.practice) {
                PracticeScreen()
            }
            .badge(store.dueMistakeIDs.count)
            Tab("我的", systemImage: "person.crop.circle.fill", value: Router.Tab.profile) {
                ProfileScreen()
            }
        }
        .fullScreenCover(item: $router.screen) { screen in
            switch screen {
            case let .session(session, title):
                LessonScreen(session: session, title: title)
            case let .cards(cards, title):
                CardSessionScreen(cards: cards, title: title)
            case let .lab(lab):
                LabScreen(lab: lab)
            }
        }
        .sheet(isPresented: $router.showsOutOfHearts) {
            OutOfHeartsSheet()
                .presentationDetents([.medium])
        }
        .overlay(alignment: .top) {
            if let toast = router.toast {
                ToastBanner(text: toast)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task(id: toast) {
                        try? await Task.sleep(for: .seconds(3))
                        router.toast = nil
                    }
            }
        }
        .animation(.spring(duration: 0.35), value: router.toast)
        .alert("学习记录", isPresented: .constant(store.loadWarning != nil && !dismissedWarning)) {
            Button("知道了") { dismissedWarning = true }
        } message: {
            Text(store.loadWarning ?? "")
        }
        .onAppear(perform: applyLaunchArguments)
    }

    @State private var dismissedWarning = false

    /// 截图与调试用：`-tab practice|profile`、`-openLesson c04-01`、`-openExercises c04-01-01,c04-04-03`、`-openLab rate-limiter-race`。
    private func applyLaunchArguments() {
        let args = ProcessInfo.processInfo.arguments
        func value(_ flag: String) -> String? {
            guard let i = args.firstIndex(of: flag), i + 1 < args.count else { return nil }
            return args[i + 1]
        }
        if let tab = value("-tab") {
            router.selectedTab = ["practice": .practice, "profile": .profile][tab] ?? .learn
        }
        if let id = value("-openLesson"), let lesson = store.library.lesson(id) {
            router.startLesson(lesson, store: store)
        }
        if let ids = value("-openExercises") {
            let exercises = ids.split(separator: ",").compactMap { store.library.exercise(String($0)) }
            router.screen = .session(LessonSession(kind: .practice, exercises: exercises, seed: 1), title: "调试")
        }
        if let id = value("-openLab"), let lab = store.library.course.chapters.flatMap(\.labs).first(where: { $0.id == id }) {
            router.openLab(lab)
        }
    }
}

/// 顶栏：连胜、今日 XP、红心。
struct StatsBar: View {
    @Environment(ProgressStore.self) private var store
    @Environment(Router.self) private var router

    var body: some View {
        HStack {
            StatPill(symbol: "flame.fill", value: "\(store.streak)",
                     color: store.studiedToday ? Palette.orange : Palette.lockedIcon)
                .accessibilityLabel("连胜 \(store.streak) 天")
            Spacer()
            StatPill(symbol: "bolt.fill", value: "\(store.todayXP)/\(store.dailyGoal)", color: Palette.gold)
                .accessibilityLabel("今日 \(store.todayXP) XP，目标 \(store.dailyGoal)")
            Spacer()
            Button {
                if store.heartsEnabled && store.hearts < HeartState.maximum { router.showsOutOfHearts = true }
            } label: {
                StatPill(symbol: "heart.fill", value: store.heartsEnabled ? "\(store.hearts)" : "∞", color: Palette.red)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(store.heartsEnabled ? "红心 \(store.hearts) 颗" : "红心无限")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }
}

struct OutOfHeartsSheet: View {
    @Environment(ProgressStore.self) private var store
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 18) {
            HStack(spacing: 6) {
                ForEach(0..<HeartState.maximum, id: \.self) { i in
                    Image(systemName: i < store.hearts ? "heart.fill" : "heart")
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(i < store.hearts ? Palette.red : Palette.lockedIcon)
                }
            }
            .padding(.top, 28)
            Text(store.hearts == 0 ? "红心用完了" : "还有 \(store.hearts) 颗红心")
                .font(.rounded(24, .heavy))
                .foregroundStyle(Palette.text)
            TimelineView(.periodic(from: .now, by: 1)) { context in
                if let next = store.nextHeartRefill {
                    Text("下一颗将在 \(next, style: .relative)后恢复。闯关答错扣一颗，练习模式不扣，还能赚回一颗。")
                } else {
                    Text("闯关答错扣一颗，每 30 分钟恢复一颗。")
                }
            }
            .font(.rounded(15))
            .foregroundStyle(Palette.secondaryText)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 24)
            Spacer()
            VStack(spacing: 10) {
                Button("练习赚红心") {
                    dismiss()
                    router.startPractice(store: store)
                }
                .buttonStyle(ChunkyButtonStyle(fill: Palette.blue, shadow: Palette.blueShadow))
                .disabled(store.practicePool.isEmpty)
                Button("关闭红心限制") {
                    store.updateSettings { $0.heartsEnabled = false }
                    dismiss()
                }
                .font(.rounded(16, .bold))
                .foregroundStyle(Palette.blueShadow)
                .padding(.vertical, 8)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity)
        .screenBackground()
    }
}
