import Foundation
import Testing
@testable import SystemDesignQuest

@Suite("判分与出题顺序")
struct GradingTests {
    let library = Fixtures.library()

    @Test func parsesFillBlanks() {
        let parsed = Exercise.parseFill("A [[x]] B [[y]]")
        #expect(parsed.answers == ["x", "y"])
        #expect(parsed.segments == [.text("A "), .blank(0), .text(" B "), .blank(1)])
    }

    @Test func gradesEveryType() throws {
        let single = try #require(library.exercise("c01-01-01"))
        #expect(Grader.isCorrect(single, .single(1)))
        #expect(!Grader.isCorrect(single, .single(0)))

        let judge = try #require(library.exercise("c01-01-02"))
        #expect(Grader.isCorrect(judge, .judge(false)))
        #expect(!Grader.isCorrect(judge, .judge(true)))

        let fill = try #require(library.exercise("c01-01-03"))
        #expect(Grader.isCorrect(fill, .fill(["容量", "速率"])))
        #expect(!Grader.isCorrect(fill, .fill(["速率", "容量"])))

        let multi = try #require(library.exercise("c01-02-01"))
        #expect(Grader.isCorrect(multi, .multi([0, 2])))
        #expect(!Grader.isCorrect(multi, .multi([0])))
        #expect(!Grader.isCorrect(multi, .multi([0, 1, 2])))

        let order = try #require(library.exercise("c01-02-02"))
        #expect(Grader.isCorrect(order, .order(["一", "二", "三"])))
        #expect(!Grader.isCorrect(order, .order(["二", "一", "三"])))

        let match = try #require(library.exercise("c01-02-03"))
        #expect(Grader.isCorrect(match, .match(mistakes: 2)))
        #expect(!Grader.isFirstTryClean(.match(mistakes: 2)))
        #expect(Grader.isFirstTryClean(.match(mistakes: 0)))
        // 题型不匹配的作答一律判错
        #expect(!Grader.isCorrect(single, .judge(true)))
    }

    @Test func correctAnswerTextFillsBlanks() throws {
        let fill = try #require(library.exercise("c01-01-03"))
        #expect(Grader.correctAnswerText(fill) == "令牌桶的 【容量】 管突发，【速率】 管长期。")
    }

    @Test func presentationShufflesWithoutLosingItems() throws {
        var rng = SeededGenerator(seed: 42)
        let order = try #require(library.exercise("c01-02-02"))
        let match = try #require(library.exercise("c01-02-03"))
        let fill = try #require(library.exercise("c01-01-03"))
        for _ in 0..<50 {
            let p = Presentation.make(for: order, using: &rng)
            #expect(p.shuffledItems.sorted() == ["一", "三", "二"].sorted())
            #expect(p.shuffledItems != ["一", "二", "三"], "排序题不能以正确顺序出现")
            let m = Presentation.make(for: match, using: &rng)
            #expect(Set(m.leftOrder) == Set(0..<4))
            #expect(m.leftOrder != m.rightOrder, "左右两列不能一一对齐")
            let f = Presentation.make(for: fill, using: &rng)
            #expect(Set(f.chips) == ["容量", "速率", "窗口"])
        }
    }
}

@Suite("答题状态机")
@MainActor
struct SessionTests {
    let library = Fixtures.library()

    @Test func wrongAnswersComeBackAtTheEnd() throws {
        let lesson = try #require(library.lesson("c01-01"))
        let session = LessonSession(kind: .lesson(id: lesson.id), exercises: lesson.exercises, seed: 1)
        #expect(session.uniqueCount == 3)

        // 第 1 题答错
        let first = try #require(session.current)
        let outcome = try #require(session.submit(.single(0)))
        #expect(!outcome.correct && outcome.firstAttempt)
        #expect(session.phase == .feedback(correct: false))
        #expect(session.items.count == 4)
        #expect(session.progress == 0)
        session.advance()

        // 后两题答对
        _ = session.submit(.judge(false)); session.advance()
        _ = session.submit(.fill(["容量", "速率"])); session.advance()
        #expect(abs(session.progress - 2.0 / 3.0) < 0.001)

        // 答错的题回到最后，这次答对
        let retry = try #require(session.current)
        #expect(retry.isRetry && retry.exercise.id == first.exercise.id)
        let second = try #require(session.submit(.single(1)))
        #expect(second.correct && !second.firstAttempt)
        session.advance()
        #expect(session.isFinished)

        let result = session.result()
        #expect(result.missedIDs == ["c01-01-01"])
        #expect(result.firstTryCorrect == 2)
        #expect(!result.isPerfect)
        #expect(XPRules.xp(for: result) == XPRules.lesson)
    }

    @Test func perfectLessonEarnsBonus() throws {
        let lesson = try #require(library.lesson("c02-01"))
        let session = LessonSession(kind: .lesson(id: lesson.id), exercises: lesson.exercises)
        _ = session.submit(.judge(true))
        session.advance()
        let result = session.result()
        #expect(result.isPerfect)
        #expect(XPRules.xp(for: result) == XPRules.lesson + XPRules.perfectLessonBonus)
    }

    @Test func matchWithMistakesIsRecordedAsMissedButNotRetried() throws {
        let match = try #require(library.exercise("c01-02-03"))
        let session = LessonSession(kind: .practice, exercises: [match])
        let outcome = try #require(session.submit(.match(mistakes: 1)))
        #expect(outcome.correct && !outcome.clean)
        session.advance()
        #expect(session.isFinished)
        #expect(session.result().missedIDs == [match.id])
    }

    @Test func duplicateExercisesAreDropped() throws {
        let e = try #require(library.exercise("c01-01-02"))
        let session = LessonSession(kind: .practice, exercises: [e, e])
        #expect(session.uniqueCount == 1)
    }

    @Test func unitTestCoversEveryLesson() throws {
        let chapter = try #require(library.chapter(1))
        var rng = SeededGenerator(seed: 7)
        let picked = SessionBuilder.unitTest(for: chapter, using: &rng)
        #expect(Set(picked.map(\.lessonID)) == ["c01-01", "c01-02"])
        #expect(picked.count == 6)
    }
}

@Suite("红心、连胜与间隔复习")
struct SchedulingTests {
    let calendar = Fixtures.calendar

    @Test func heartsRefillEveryThirtyMinutes() {
        var hearts = HeartState()
        let t0 = Fixtures.date(1)
        hearts.lose(at: t0)
        hearts.lose(at: t0.addingTimeInterval(60))
        #expect(hearts.count(at: t0.addingTimeInterval(61)) == 3)
        // 恢复从第一次扣心开始计时
        #expect(hearts.count(at: t0.addingTimeInterval(30 * 60)) == 4)
        #expect(hearts.nextRefill(at: t0.addingTimeInterval(30 * 60)) == t0.addingTimeInterval(60 * 60))
        #expect(hearts.count(at: t0.addingTimeInterval(60 * 60)) == 5)
        #expect(hearts.nextRefill(at: t0.addingTimeInterval(60 * 60)) == nil)
        // 满心后再扣，计时重新开始
        hearts.lose(at: t0.addingTimeInterval(3 * 3600))
        #expect(hearts.count(at: t0.addingTimeInterval(3 * 3600 + 29 * 60)) == 4)
    }

    @Test func heartsNeverGoBelowZeroOrAboveMax() {
        var hearts = HeartState()
        let t0 = Fixtures.date(1)
        for _ in 0..<8 { hearts.lose(at: t0) }
        #expect(hearts.count(at: t0) == 0)
        hearts.gain(3, at: t0)
        hearts.gain(9, at: t0)
        #expect(hearts.count(at: t0) == HeartState.maximum)
    }

    @Test func streakExtendsResetsAndUsesFreezes() {
        var streak = StreakState()
        let d1 = DayKey(year: 2026, month: 9, day: 1)
        #expect(streak.registerActivity(on: d1, calendar: calendar) == .started)
        #expect(streak.registerActivity(on: d1, calendar: calendar) == .alreadyCounted)
        for day in 2...7 {
            streak.registerActivity(on: DayKey(year: 2026, month: 9, day: day), calendar: calendar)
        }
        #expect(streak.current == 7)
        #expect(streak.freezes == 1, "连续 7 天奖励一次保护")
        // 断一天（9 号没学），10 号学习时自动用掉保护
        let d9 = DayKey(year: 2026, month: 9, day: 9)
        #expect(streak.displayed(today: d9, calendar: calendar) == 7)
        #expect(streak.registerActivity(on: DayKey(year: 2026, month: 9, day: 9), calendar: calendar) == .protected(usedFreezes: 1, to: 8))
        #expect(streak.frozenDays == [DayKey(year: 2026, month: 9, day: 8)])
        // 再断两天，保护不够，重置
        let d12 = DayKey(year: 2026, month: 9, day: 12)
        #expect(streak.displayed(today: d12, calendar: calendar) == 0)
        #expect(streak.registerActivity(on: d12, calendar: calendar) == .reset(from: 8))
        #expect(streak.current == 1)
        #expect(streak.longest == 8)
    }

    @Test func streakCrossesMonthAndDaylightSaving() {
        var ny = Calendar(identifier: .gregorian)
        ny.timeZone = TimeZone(identifier: "America/New_York")!
        var streak = StreakState()
        // 2026-03-08 美国夏令时开始，当天只有 23 小时
        streak.registerActivity(on: DayKey(year: 2026, month: 3, day: 7), calendar: ny)
        streak.registerActivity(on: DayKey(year: 2026, month: 3, day: 8), calendar: ny)
        streak.registerActivity(on: DayKey(year: 2026, month: 3, day: 9), calendar: ny)
        #expect(streak.current == 3)
        #expect(DayKey(year: 2026, month: 2, day: 28).adding(days: 1, calendar: ny) == DayKey(year: 2026, month: 3, day: 1))
    }

    @Test func mistakesGraduateAfterFiveCorrectReviews() {
        let t0 = Fixtures.date(1)
        var memory = MistakeMemory(missedAt: t0)
        #expect(memory.isDue(at: t0))
        var now = t0
        let expectedGaps: [Double] = [1, 3, 7, 16]
        for gap in expectedGaps {
            let promoted = memory.answeredCorrectly(at: now)
            #expect(promoted)
            #expect(memory.due == now.addingTimeInterval(gap * 86_400))
            now = memory.due
        }
        #expect(memory.box == 5)
        let stillLearning = memory.answeredCorrectly(at: now)
        #expect(!stillLearning, "5 号盒再答对即掌握")
        memory.missed(at: now)
        #expect(memory.box == 1 && memory.lapses == 2)
    }

    @Test func cardIntervalsGrowWithGrade() {
        let t0 = Fixtures.date(1)
        var card = CardMemory(now: t0)
        card.review(.good, at: t0)
        #expect(card.interval == 1)
        card.review(.good, at: t0)
        #expect(card.interval == 3)
        card.review(.good, at: t0)
        #expect(card.interval == 7.5)
        card.review(.again, at: t0)
        #expect(card.interval == 0 && card.due == t0.addingTimeInterval(600))
        #expect(card.ease < 2.5)
        var easy = CardMemory(now: t0)
        easy.review(.easy, at: t0)
        easy.review(.easy, at: t0)
        easy.review(.easy, at: t0)
        #expect(easy.isMastered)
    }
}

@Suite("学习路径")
@MainActor
struct PathTests {
    let library = Fixtures.library()

    @Test func buildsUnitNodesInOrder() throws {
        let chapter = try #require(library.chapter(1))
        let nodes = LearningPath.nodes(for: chapter, cards: library.cards(chapter: 1))
        #expect(nodes.map(\.id) == ["c01-01", "c01-02", "c01-labs", "c01-cards", "c01-test"])
    }

    @Test func requiredNodesGateTheRest() {
        let nodes = LearningPath.allNodes(in: library)
        var done: Set<String> = []
        var states = LearningPath.states(for: nodes, isCompleted: { done.contains($0.id) }, freeMode: false)
        #expect(states["c01-01"] == .current)
        #expect(states["c01-02"] == .locked)
        #expect(states["c01-labs"] == .locked)

        done = ["c01-01", "c01-02"]
        states = LearningPath.states(for: nodes, isCompleted: { done.contains($0.id) }, freeMode: false)
        #expect(states["c01-labs"] == .available, "实验在已完成的必修关卡之后，可以进入")
        #expect(states["c01-cards"] == .available)
        #expect(states["c01-test"] == .current, "选修关卡不挡路")
        #expect(states["c02-01"] == .locked)

        states = LearningPath.states(for: nodes, isCompleted: { done.contains($0.id) }, freeMode: true)
        #expect(states["c02-01"] == .available)
        #expect(states["c01-test"] == .current)
    }
}
