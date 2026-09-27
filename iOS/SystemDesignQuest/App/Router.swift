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

    var screen: Screen?
    /// 红心不足时弹出的提示。
    var showsOutOfHearts = false
    var selectedTab: Tab = .learn

    enum Tab: Hashable { case learn, practice, profile }

    func startLesson(_ lesson: Lesson, store: ProgressStore) {
        start(.lesson(id: lesson.id), exercises: lesson.exercises, title: lesson.title, store: store)
    }

    func startUnitTest(chapter: Chapter, store: ProgressStore) {
        var rng = SystemRandomNumberGenerator()
        start(.unitTest(chapter: chapter.number), exercises: SessionBuilder.unitTest(for: chapter, using: &rng),
              title: "第 \(chapter.number) 单元测验", store: store)
    }

    func startMistakes(store: ProgressStore) {
        start(.mistakes, exercises: store.mistakeSession(), title: "错题复习", store: store)
    }

    func startPractice(store: ProgressStore) {
        var rng = SystemRandomNumberGenerator()
        let exercises = SessionBuilder.practice(from: store.practicePool, weak: Set(store.mistakeIDs), using: &rng)
        start(.practice, exercises: exercises, title: "随机练习", store: store)
    }

    func startCards(_ cards: [Card], title: String) {
        guard !cards.isEmpty else { return }
        screen = .cards(cards, title: title)
    }

    func openLab(_ lab: Lab) {
        screen = .lab(lab)
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
