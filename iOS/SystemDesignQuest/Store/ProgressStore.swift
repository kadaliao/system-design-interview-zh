import Foundation
import Observation

/// 完成一轮学习后弹出的庆祝信息。
struct Celebration: Equatable, Sendable {
    var xp = 0
    var streakEvent: StreakEvent = .alreadyCounted
    var streak = 0
    var todayXP = 0
    var dailyGoal = 0
    var goalJustReached = false
    var heartsGained = 0
    var newAchievements: [String] = []
}

/// 学习进度的唯一入口：读写存档，计算路径状态、红心、连胜、错题与口述卡调度。
@MainActor
@Observable
final class ProgressStore {
    private(set) var state: ProgressState
    let library: CourseLibrary
    let pathNodes: [PathNode]
    /// 内容门控：免费章节之外需要完整版。
    let entitlements: any EntitlementProviding
    /// 存档读取失败时的提示（旧档已另存备份）。
    private(set) var loadWarning: String?
    /// 学习活动变化后回调，用于重新安排每日提醒。
    @ObservationIgnored var onActivityChanged: (() -> Void)?

    @ObservationIgnored let calendar: Calendar
    @ObservationIgnored private let clock: () -> Date
    @ObservationIgnored private let fileURL: URL?
    @ObservationIgnored private var saveTask: Task<Void, Never>?

    init(library: CourseLibrary, fileURL: URL? = ProgressStore.defaultFileURL(),
         calendar: Calendar = .current, clock: @escaping () -> Date = { .now },
         entitlements: any EntitlementProviding = StaticEntitlements(hasFullAccess: true)) {
        self.library = library
        self.entitlements = entitlements
        self.fileURL = fileURL
        self.calendar = calendar
        self.clock = clock
        self.pathNodes = LearningPath.allNodes(in: library)
        self.state = ProgressState()
        if let fileURL { load(from: fileURL) }
    }

    static func defaultFileURL() -> URL? {
        guard let dir = try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                      appropriateFor: nil, create: true) else { return nil }
        return dir.appending(path: "progress.json")
    }

    var now: Date { clock() }
    var today: DayKey { DayKey(now, calendar: calendar) }
    var settings: ProgressState.Settings { state.settings }

    // MARK: - 每日目标与连胜

    var todayXP: Int { state.xpByDay[today] ?? 0 }
    var dailyGoal: Int { state.settings.dailyGoal }
    var goalProgress: Double { min(1, Double(todayXP) / Double(max(1, dailyGoal))) }
    var streak: Int { state.streak.displayed(today: today, calendar: calendar) }
    var studiedToday: Bool { state.streak.isActive(on: today) }

    /// 最近 7 天（含今天）的 XP。
    func recentXP(days: Int = 7) -> [(day: DayKey, xp: Int)] {
        (0..<days).reversed().map { offset in
            let day = today.adding(days: -offset, calendar: calendar)
            return (day, state.xpByDay[day] ?? 0)
        }
    }

    // MARK: - 红心

    var heartsEnabled: Bool { state.settings.heartsEnabled }
    var hearts: Int { heartsEnabled ? state.hearts.count(at: now) : HeartState.maximum }
    var nextHeartRefill: Date? { heartsEnabled ? state.hearts.nextRefill(at: now) : nil }
    func canStart(_ kind: SessionKind) -> Bool { !kind.costsHearts || !heartsEnabled || hearts > 0 }

    // MARK: - 学习路径

    func isCompleted(_ node: PathNode) -> Bool {
        switch node.kind {
        case let .lesson(lesson): state.lessons[lesson.id] != nil
        case let .labs(labs): labs.contains { state.completedLabs[$0.id] != nil }
        case let .cards(cards): cards.allSatisfy { state.cards[$0.id] != nil }
        case .unitTest: state.passedUnitTests[node.chapter] != nil
        }
    }

    func nodeStates() -> [String: NodeState] {
        LearningPath.states(for: pathNodes, isCompleted: isCompleted, freeMode: state.settings.freeMode,
                            isChapterUnlocked: { [entitlements] in entitlements.isUnlocked(chapter: $0) })
    }

    func unitProgress(_ chapter: Int) -> (done: Int, total: Int) {
        let nodes = pathNodes.filter { $0.chapter == chapter }
        return (nodes.filter(isCompleted).count, nodes.count)
    }

    var currentNode: PathNode? {
        let states = nodeStates()
        return pathNodes.first { states[$0.id] == .current }
    }

    var completedLessonCount: Int { state.lessons.count }
    var passedUnitCount: Int { state.passedUnitTests.count }

    /// 已完成课程里的全部题目，随机练习从这里抽。
    var learnedExercises: [Exercise] {
        library.chapters.flatMap { chapter in
            guard entitlements.isUnlocked(chapter: chapter.number) else { return [Exercise]() }
            return chapter.lessons.filter { state.lessons[$0.id] != nil }.flatMap(\.exercises)
        }
    }

    /// 随机练习的题池：学过的课；一课都没学完时，用当前单元的题。
    var practicePool: [Exercise] {
        let learned = learnedExercises
        if !learned.isEmpty { return learned }
        var chapter = currentNode?.chapter ?? library.chapters.first?.number ?? 1
        if !entitlements.isUnlocked(chapter: chapter) { chapter = library.chapters.first?.number ?? 1 }
        guard entitlements.isUnlocked(chapter: chapter) else { return [] }
        return library.chapter(chapter)?.lessons.first?.exercises ?? []
    }

    // MARK: - 错题本

    var mistakeIDs: [String] {
        state.mistakes.sorted { $0.value.due < $1.value.due }.map(\.key).filter { id in
            guard let exercise = library.exercise(id) else { return false }
            return entitlements.isUnlocked(chapter: exercise.chapter)
        }
    }

    var dueMistakeIDs: [String] {
        let now = now
        return mistakeIDs.filter { state.mistakes[$0]!.isDue(at: now) }
    }

    func mistakeSession() -> [Exercise] {
        dueMistakeIDs.prefix(SessionBuilder.mistakeSessionSize).compactMap(library.exercise)
    }

    // MARK: - 口述卡

    func dueCards(chapter: Int? = nil) -> [Card] {
        let now = now
        return library.course.cards.filter { card in
            entitlements.isUnlockedCard(card) && (chapter == nil || card.chapter == chapter)
                && (state.cards[card.id]?.isDue(at: now) ?? true)
        }
    }

    /// 已复习过且到期的卡排前面，然后是新卡。
    func cardSession(chapter: Int? = nil, limit: Int = 10) -> [Card] {
        let due = dueCards(chapter: chapter)
        let reviewed = due.filter { state.cards[$0.id] != nil }.sorted { state.cards[$0.id]!.due < state.cards[$1.id]!.due }
        let fresh = due.filter { state.cards[$0.id] == nil }
        return Array((reviewed + fresh).prefix(limit))
    }

    var masteredCardCount: Int { state.cards.values.filter(\.isMastered).count }

    // MARK: - 答题记录

    func record(_ outcome: AnswerOutcome, for exercise: Exercise, in kind: SessionKind) {
        let now = now
        if outcome.firstAttempt {
            state.answered += 1
            if outcome.clean { state.answeredFirstTryCorrect += 1 }
        }
        if !outcome.clean {
            if outcome.firstAttempt {
                if state.mistakes[exercise.id] != nil {
                    state.mistakes[exercise.id]!.missed(at: now)
                } else {
                    state.mistakes[exercise.id] = MistakeMemory(missedAt: now)
                }
            }
        } else if outcome.firstAttempt, var memory = state.mistakes[exercise.id], memory.isDue(at: now) {
            if memory.answeredCorrectly(at: now) {
                state.mistakes[exercise.id] = memory
            } else {
                state.mistakes[exercise.id] = nil
                state.masteredMistakes += 1
            }
        }
        if !outcome.correct, kind.costsHearts, heartsEnabled {
            state.hearts.lose(at: now)
        }
        scheduleSave()
    }

    /// 一轮答题全部完成（红心耗尽中途退出的不算）。
    @discardableResult
    func finish(_ result: SessionResult) -> Celebration {
        let now = now
        var heartsGained = 0
        switch result.kind {
        case let .lesson(id):
            if var record = state.lessons[id] {
                record.lastCompleted = now
                record.timesCompleted += 1
                record.bestAccuracy = max(record.bestAccuracy, result.accuracy)
                state.lessons[id] = record
            } else {
                state.lessons[id] = .init(firstCompleted: now, lastCompleted: now, timesCompleted: 1, bestAccuracy: result.accuracy)
            }
            if result.isPerfect { state.perfectLessons += 1 }
        case let .unitTest(chapter):
            if state.passedUnitTests[chapter] == nil { state.passedUnitTests[chapter] = now }
        case .practice:
            if heartsEnabled, state.hearts.count(at: now) < HeartState.maximum {
                state.hearts.gain(at: now)
                heartsGained = 1
            }
        case .mistakes:
            break
        }
        var celebration = award(XPRules.xp(for: result))
        celebration.heartsGained = heartsGained
        return celebration
    }

    @discardableResult
    func completeLab(_ lab: Lab) -> Celebration? {
        guard state.completedLabs[lab.id] == nil else { return nil }
        state.completedLabs[lab.id] = now
        return award(XPRules.lab)
    }

    func isLabCompleted(_ lab: Lab) -> Bool { state.completedLabs[lab.id] != nil }

    func review(_ card: Card, grade: CardGrade) {
        var memory = state.cards[card.id] ?? CardMemory(now: now)
        memory.review(grade, at: now)
        state.cards[card.id] = memory
        state.cardReviews += 1
        scheduleSave()
    }

    @discardableResult
    func finishCards(count: Int) -> Celebration {
        award(count * XPRules.card)
    }

    private func award(_ xp: Int) -> Celebration {
        let before = todayXP
        let today = today
        state.xpByDay[today, default: 0] += xp
        let event = state.streak.registerActivity(on: today, calendar: calendar)
        let unlocked = unlockAchievements()
        scheduleSave()
        onActivityChanged?()
        return Celebration(xp: xp, streakEvent: event, streak: state.streak.current, todayXP: todayXP,
                           dailyGoal: dailyGoal, goalJustReached: before < dailyGoal && todayXP >= dailyGoal,
                           newAchievements: unlocked)
    }

    // MARK: - 成就

    var achievementStats: AchievementStats {
        AchievementStats(lessonsCompleted: state.lessons.count, perfectLessons: state.perfectLessons,
                         unitsPassed: state.passedUnitTests.count, longestStreak: state.streak.longest,
                         totalXP: state.totalXP, labsCompleted: state.completedLabs.count,
                         cardReviews: state.cardReviews, mistakesMastered: state.masteredMistakes,
                         totalUnits: library.chapters.count)
    }

    private func unlockAchievements() -> [String] {
        let stats = achievementStats
        var fresh: [String] = []
        for achievement in Achievements.all where state.achievements[achievement.id] == nil && achievement.isUnlocked(stats) {
            state.achievements[achievement.id] = now
            fresh.append(achievement.id)
        }
        return fresh
    }

    // MARK: - 设置

    func updateSettings(_ change: (inout ProgressState.Settings) -> Void) {
        let wasEnabled = state.settings.heartsEnabled
        change(&state.settings)
        if !wasEnabled && state.settings.heartsEnabled { state.hearts.refill() }
        scheduleSave()
        onActivityChanged?()
    }

    /// 演示与测试用：直接改写进度并补发成就。
    func seedForDemo(_ change: (inout ProgressState) -> Void) {
        change(&state)
        _ = unlockAchievements()
    }

    func resetProgress() {
        let settings = state.settings
        state = ProgressState()
        state.settings = settings
        saveNow()
        onActivityChanged?()
    }

    // MARK: - 存档

    private func load(from url: URL) {
        guard FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else { return }
        do {
            state = try JSONDecoder().decode(ProgressState.self, from: Data(contentsOf: url))
        } catch {
            // 读不出来时不覆盖旧档：先另存一份，再从头开始
            let backup = url.deletingLastPathComponent()
                .appending(path: "progress-unreadable-\(Int(Date().timeIntervalSince1970)).json")
            try? FileManager.default.copyItem(at: url, to: backup)
            loadWarning = String(localized: "学习记录无法读取，已另存为 \(backup.lastPathComponent)，这次从头开始。")
        }
    }

    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            self?.saveNow()
        }
    }

    func saveNow() {
        saveTask?.cancel()
        guard let fileURL else { return }
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            try encoder.encode(state).write(to: fileURL, options: .atomic)
        } catch {
            assertionFailure("保存学习记录失败：\(error)")
        }
    }
}
