import Foundation
import Testing
@testable import SystemDesignQuest

@Suite("学习进度")
@MainActor
struct StoreTests {
    let library = Fixtures.library()

    private func makeStore(_ clock: TestClock, file: URL? = nil) -> ProgressStore {
        ProgressStore(library: library, fileURL: file, calendar: Fixtures.calendar, clock: { clock.now })
    }

    private func play(_ lessonID: String, in store: ProgressStore, wrongFirst: Bool) throws -> Celebration {
        let lesson = try #require(library.lesson(lessonID))
        let session = LessonSession(kind: .lesson(id: lessonID), exercises: lesson.exercises, seed: 3)
        var wrongDone = !wrongFirst
        while let item = session.current {
            let response: ExerciseResponse
            if !wrongDone, case .judge = item.exercise.kind {
                response = .judge(true)   // c01-01-02 的正确答案是 false
                wrongDone = true
            } else {
                response = correctResponse(item.exercise)
            }
            let outcome = try #require(session.submit(response))
            store.record(outcome, for: item.exercise, in: session.kind)
            session.advance()
        }
        return store.finish(session.result(at: store.now))
    }

    private func correctResponse(_ e: Exercise) -> ExerciseResponse {
        switch e.kind {
        case let .single(_, answer): .single(answer)
        case let .multi(_, answers): .multi(answers)
        case let .judge(answer): .judge(answer)
        case let .fill(_, answers, _): .fill(answers)
        case let .order(items): .order(items)
        case .match: .match(mistakes: 0)
        }
    }

    @Test func lessonAwardsXPStreakAndRecordsMistakes() throws {
        let clock = TestClock(Fixtures.date(1))
        let store = makeStore(clock)
        let celebration = try play("c01-01", in: store, wrongFirst: true)
        #expect(celebration.xp == XPRules.lesson)
        #expect(celebration.streakEvent == .started)
        #expect(store.todayXP == XPRules.lesson)
        #expect(store.hearts == HeartState.maximum - 1)
        #expect(store.mistakeIDs == ["c01-01-02"])
        #expect(store.dueMistakeIDs == ["c01-01-02"])
        #expect(store.state.answered == 3)
        #expect(store.state.answeredFirstTryCorrect == 2)
        #expect(celebration.newAchievements.contains("first-lesson"))

        // 路径推进到第二课
        #expect(store.currentNode?.id == "c01-02")
    }

    @Test func mistakeReviewPromotesAndGraduates() throws {
        let clock = TestClock(Fixtures.date(1))
        let store = makeStore(clock)
        _ = try play("c01-01", in: store, wrongFirst: true)
        let exercise = try #require(library.exercise("c01-01-02"))
        let clean = AnswerOutcome(correct: true, clean: true, firstAttempt: true)
        for _ in 0..<4 {
            store.record(clean, for: exercise, in: .mistakes)
            #expect(store.dueMistakeIDs.isEmpty, "答对后要等到下一个间隔才到期")
            clock.advance(20 * 86_400)
        }
        store.record(clean, for: exercise, in: .mistakes)
        #expect(store.mistakeIDs.isEmpty)
        #expect(store.state.masteredMistakes == 1)
    }

    @Test func practiceRestoresAHeartAndDoesNotCostHearts() throws {
        let clock = TestClock(Fixtures.date(1))
        let store = makeStore(clock)
        let exercise = try #require(library.exercise("c01-01-01"))
        store.record(AnswerOutcome(correct: false, clean: false, firstAttempt: true), for: exercise, in: .lesson(id: "c01-01"))
        store.record(AnswerOutcome(correct: false, clean: false, firstAttempt: true), for: exercise, in: .practice)
        #expect(store.hearts == 4, "练习答错不扣红心")
        let result = SessionResult(kind: .practice, exerciseCount: 10, firstTryCorrect: 9, missedIDs: [], duration: 60)
        let celebration = store.finish(result)
        #expect(celebration.heartsGained == 1)
        #expect(store.hearts == 5)
    }

    @Test func outOfHeartsBlocksLessonsButNotPractice() throws {
        let clock = TestClock(Fixtures.date(1))
        let store = makeStore(clock)
        let exercise = try #require(library.exercise("c01-01-01"))
        for _ in 0..<5 {
            store.record(AnswerOutcome(correct: false, clean: false, firstAttempt: false), for: exercise, in: .unitTest(chapter: 1))
        }
        #expect(store.hearts == 0)
        #expect(!store.canStart(.lesson(id: "c01-01")))
        #expect(store.canStart(.practice))
        store.updateSettings { $0.heartsEnabled = false }
        #expect(store.canStart(.lesson(id: "c01-01")))
        store.updateSettings { $0.heartsEnabled = true }
        #expect(store.hearts == HeartState.maximum, "重新打开红心限制时补满")
    }

    @Test func dailyGoalAndStreakAcrossDays() throws {
        let clock = TestClock(Fixtures.date(1, hour: 23))
        let store = makeStore(clock)
        store.updateSettings { $0.dailyGoal = 20 }
        var c = try play("c01-01", in: store, wrongFirst: false)
        #expect(!c.goalJustReached)
        c = try play("c01-02", in: store, wrongFirst: false)
        #expect(c.goalJustReached)
        #expect(c.streakEvent == .alreadyCounted)
        clock.advance(2 * 3600) // 跨过零点
        c = store.finishCards(count: 3)
        #expect(c.xp == 3 * XPRules.card)
        #expect(c.streakEvent == .extended(to: 2))
        #expect(store.recentXP(days: 2).map(\.xp) == [XPRules.lesson * 2 + XPRules.perfectLessonBonus * 2, 3 * XPRules.card])
    }

    @Test func labCompletionCountsOnce() throws {
        let clock = TestClock(Fixtures.date(1))
        let store = makeStore(clock)
        let lab = try #require(library.chapter(1)?.labs.first)
        #expect(store.completeLab(lab)?.xp == XPRules.lab)
        #expect(store.completeLab(lab) == nil)
        let labNode = try #require(store.pathNodes.first { $0.id == "c01-labs" })
        #expect(store.isCompleted(labNode))
    }

    @Test func cardReviewSchedulesNextTime() throws {
        let clock = TestClock(Fixtures.date(1))
        let store = makeStore(clock)
        let card = try #require(library.card("Q01-01"))
        #expect(store.dueCards().map(\.id) == ["Q01-01"])
        store.review(card, grade: .good)
        #expect(store.dueCards().isEmpty)
        clock.advance(86_400)
        #expect(store.dueCards().map(\.id) == ["Q01-01"])
        let node = try #require(store.pathNodes.first { $0.id == "c01-cards" })
        #expect(store.isCompleted(node))
    }

    @Test func persistsAndReloads() throws {
        let dir = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = dir.appending(path: "progress.json")
        let clock = TestClock(Fixtures.date(1))
        let store = makeStore(clock, file: file)
        _ = try play("c01-01", in: store, wrongFirst: true)
        store.updateSettings { $0.dailyGoal = 30; $0.freeMode = true }
        store.saveNow()

        let reloaded = makeStore(clock, file: file)
        #expect(reloaded.state == store.state)
        #expect(reloaded.settings.dailyGoal == 30)
        #expect(reloaded.streak == 1)
        // 日期键按字符串存
        let raw = try String(contentsOf: file, encoding: .utf8)
        #expect(raw.contains("\"2026-09-01\""))
    }

    @Test func unreadableFileIsBackedUpNotOverwritten() throws {
        let dir = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = dir.appending(path: "progress.json")
        try Data("不是 JSON".utf8).write(to: file)
        let store = makeStore(TestClock(Fixtures.date(1)), file: file)
        #expect(store.loadWarning != nil)
        let backups = try FileManager.default.contentsOfDirectory(atPath: dir.path()).filter { $0.hasPrefix("progress-unreadable-") }
        #expect(backups.count == 1)
    }

    @Test func olderSaveFilesWithMissingFieldsStillLoad() throws {
        let json = #"{"lessons":{},"settings":{"dailyGoal":50}}"#
        let state = try JSONDecoder().decode(ProgressState.self, from: Data(json.utf8))
        #expect(state.settings.dailyGoal == 50)
        #expect(state.settings.heartsEnabled)
        #expect(state.hearts.count(at: .now) == HeartState.maximum)
    }

    @Test func resetKeepsSettings() throws {
        let clock = TestClock(Fixtures.date(1))
        let store = makeStore(clock)
        store.updateSettings { $0.dailyGoal = 50 }
        _ = try play("c01-01", in: store, wrongFirst: true)
        store.resetProgress()
        #expect(store.state.totalXP == 0)
        #expect(store.mistakeIDs.isEmpty)
        #expect(store.settings.dailyGoal == 50)
    }
}

@Suite("内容包")
struct BundledContentTests {
    @Test func bundledCourseIsComplete() throws {
        let library = try CourseLibrary.loadBundled()
        let course = library.course
        #expect(course.chapters.map(\.number) == Array(1...28))
        #expect(course.sections.flatMap(\.chapters) == Array(1...28))
        #expect(course.cards.count == 58)
        for chapter in course.chapters {
            for lab in chapter.labs {
                #expect(Bundle.main.url(forResource: lab.file, withExtension: nil, subdirectory: "Content/Labs/labs") != nil, "缺少实验文件 \(lab.file)")
            }
            if let image = chapter.introImage {
                #expect(CourseLibrary.imageURL(image) != nil, "缺少导读图 \(image)")
            }
        }
        for card in course.cards {
            for block in card.blocks where block.kind == .image {
                #expect(CourseLibrary.imageURL(block.image ?? "") != nil, "缺少答案图 \(block.image ?? "")")
            }
        }
        #expect(Bundle.main.url(forResource: "lab", withExtension: "html", subdirectory: "Content/Labs") != nil)
    }

    @Test func everyExerciseIsAnswerable() throws {
        let library = try CourseLibrary.loadBundled()
        var ids = Set<String>()
        for exercise in library.allExercises {
            #expect(ids.insert(exercise.id).inserted, "重复编号 \(exercise.id)")
            switch exercise.kind {
            case let .single(options, answer):
                #expect(options.indices.contains(answer))
            case let .multi(options, answers):
                #expect(answers.allSatisfy(options.indices.contains) && answers.count >= 2)
            case .judge:
                break
            case let .fill(segments, answers, distractors):
                #expect(!answers.isEmpty)
                #expect(segments.filter { if case .blank = $0 { true } else { false } }.count == answers.count)
                #expect(Set(answers + distractors).count == answers.count + distractors.count, "\(exercise.id) 词块重复")
            case let .order(items):
                #expect(Set(items).count == items.count && items.count >= 3)
            case let .match(pairs):
                #expect(Set(pairs.map(\.left)).count == pairs.count && Set(pairs.map(\.right)).count == pairs.count)
            }
            if let anchor = exercise.refAnchor {
                #expect(anchor.hasPrefix("d"), "\(exercise.id) 锚点格式错误")
            }
        }
    }
}
