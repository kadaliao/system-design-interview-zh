import Foundation
import Observation

/// 全屏学习页面（答题、口述卡、实验）的统一入口，任何页面都可以从这里开一轮学习。
@MainActor
@Observable
final class Router {
    enum Screen: Identifiable {
        case session(LessonSession, title: String)
        case cards([Card], title: String)
        case lab(Lab)

        var id: String {
            switch self {
            case let .session(session, _): "session-\(ObjectIdentifier(session).hashValue)"
            case let .cards(cards, _): "cards-" + cards.map(\.id).joined(separator: ",")
            case let .lab(lab): "lab-\(lab.id)"
            }
        }
    }

    /// 触发付费墙的入口，用来调整付费墙的文案。
    enum PaywallReason: Identifiable, Equatable {
        case chapter(Int)
        case cards
        case video(chapter: Int)
        case general

        var id: String {
            switch self {
            case let .chapter(n): "chapter-\(n)"
            case .cards: "cards"
            case let .video(n): "video-\(n)"
            case .general: "general"
            }
        }
    }

    var screen: Screen?
    /// 非 nil 时弹出付费墙。
    var paywall: PaywallReason?
    /// 用于判断内容是否已解锁；由 RootView 在出现时设置。
    @ObservationIgnored weak var store: ProgressStore?
    /// 红心不足时弹出的提示。
    var showsOutOfHearts = false
    /// 全屏页面关闭后在顶部短暂显示的提示，如「实验完成，获得 10 XP」。
    var toast: String?
    var selectedTab: Tab = .learn

    enum Tab: Hashable { case learn, practice, profile }

    func startLesson(_ lesson: Lesson, store: ProgressStore) {
        if let chapter = store.library.chapter(ofLesson: lesson.id), !allows(chapter: chapter, store: store) { return }
        start(.lesson(id: lesson.id), exercises: lesson.exercises, title: lesson.title, store: store)
    }

    func startUnitTest(chapter: Chapter, store: ProgressStore) {
        guard allows(chapter: chapter.number, store: store) else { return }
        var rng = SystemRandomNumberGenerator()
        start(.unitTest(chapter: chapter.number), exercises: SessionBuilder.unitTest(for: chapter, using: &rng),
              title: String(localized: "第 \(chapter.number) 单元测验"), store: store)
    }

    func startMistakes(store: ProgressStore) {
        start(.mistakes, exercises: store.mistakeSession(), title: String(localized: "错题复习"), store: store)
    }

    func startPractice(store: ProgressStore) {
        var rng = SystemRandomNumberGenerator()
        let exercises = SessionBuilder.practice(from: store.practicePool, weak: Set(store.mistakeIDs), using: &rng)
        start(.practice, exercises: exercises, title: String(localized: "随机练习"), store: store)
    }

    /// 只会打开已解锁的卡；一张都不能练时弹出付费墙。
    func startCards(_ cards: [Card], title: String) {
        guard !cards.isEmpty else { return }
        let allowed = store.map { store in cards.filter(store.entitlements.isUnlockedCard) } ?? cards
        guard !allowed.isEmpty else {
            paywall = .cards
            return
        }
        screen = .cards(allowed, title: title)
    }

    func openLab(_ lab: Lab) {
        if let store, let chapter = store.library.chapter(ofLab: lab.id), !allows(chapter: chapter, store: store) { return }
        screen = .lab(lab)
    }

    /// 章节已解锁返回 true；否则弹出付费墙并返回 false。
    private func allows(chapter: Int, store: ProgressStore) -> Bool {
        if store.entitlements.isUnlocked(chapter: chapter) { return true }
        paywall = .chapter(chapter)
        return false
    }

    private func start(_ kind: SessionKind, exercises: [Exercise], title: String, store: ProgressStore) {
        guard !exercises.isEmpty else { return }
        guard store.canStart(kind) else {
            showsOutOfHearts = true
            return
        }
        screen = .session(LessonSession(kind: kind, exercises: exercises), title: title)
    }
}
