import Foundation

/// `-demo` 启动参数用的示例进度：学完前 3 章和第 4 章第一课，连胜 12 天。只在内存里，不写存档。
@MainActor
enum DemoData {
    static func seed(_ store: ProgressStore) {
        let calendar = store.calendar
        let now = store.now
        store.seedForDemo { state in
            let today = DayKey(now, calendar: calendar)
            for offset in stride(from: 12, through: 1, by: -1) {
                let day = today.adding(days: -offset, calendar: calendar)
                state.streak.registerActivity(on: day, calendar: calendar)
                state.xpByDay[day] = [15, 25, 10, 40, 20, 30, 15, 35, 20, 25, 45, 30][offset % 12]
            }
            for chapter in store.library.chapters.prefix(4) {
                let lessons = chapter.number == 4 ? Array(chapter.lessons.prefix(1)) : chapter.lessons
                for lesson in lessons {
                    state.lessons[lesson.id] = .init(firstCompleted: now, lastCompleted: now, timesCompleted: 1, bestAccuracy: 0.9)
                }
                if chapter.number < 4 { state.passedUnitTests[chapter.number] = now }
                if let lab = chapter.labs.first, chapter.number < 3 { state.completedLabs[lab.id] = now }
            }
            for exercise in store.library.chapters.prefix(3).flatMap({ $0.lessons.first?.exercises.prefix(2) ?? [] }) {
                state.mistakes[exercise.id] = MistakeMemory(missedAt: now.addingTimeInterval(-3600))
            }
            for card in store.library.course.cards.prefix(4) {
                var memory = CardMemory(now: now)
                memory.review(.good, at: now.addingTimeInterval(-2 * 86_400))
                state.cards[card.id] = memory
            }
            state.hearts.lose(at: now.addingTimeInterval(-600))
            state.perfectLessons = 3
            state.answered = 96
            state.answeredFirstTryCorrect = 81
            state.cardReviews = 4
        }
    }
}
