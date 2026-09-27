import Foundation

/// 全部学习进度，整体存成 Application Support/progress.json。
struct ProgressState: Codable, Equatable, Sendable {
    struct LessonRecord: Codable, Equatable, Sendable {
        var firstCompleted: Date
        var lastCompleted: Date
        var timesCompleted: Int
        var bestAccuracy: Double
    }

    struct Settings: Codable, Equatable, Sendable {
        var dailyGoal = 20
        var heartsEnabled = true
        /// 自由模式：不按顺序解锁，所有关卡都能直接进。
        var freeMode = false
        var hapticsEnabled = true
        var reminderEnabled = false
        var reminderHour = 20
        var reminderMinute = 0
    }

    var schemaVersion = 1
    var lessons: [String: LessonRecord] = [:]
    var passedUnitTests: [Int: Date] = [:]
    var completedLabs: [String: Date] = [:]
    var xpByDay: [DayKey: Int] = [:]
    var streak = StreakState()
    var hearts = HeartState()
    /// 错题本：题目编号 → 复习状态。掌握后移除。
    var mistakes: [String: MistakeMemory] = [:]
    var masteredMistakes = 0
    var cards: [String: CardMemory] = [:]
    var cardReviews = 0
    var answered = 0
    var answeredFirstTryCorrect = 0
    var perfectLessons = 0
    var achievements: [String: Date] = [:]
    var settings = Settings()

    var totalXP: Int { xpByDay.values.reduce(0, +) }

    init() {}

    // 新增字段时给默认值，旧存档也能读。
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = ProgressState()
        schemaVersion = try c.decodeIfPresent(Int.self, forKey: .schemaVersion) ?? d.schemaVersion
        lessons = try c.decodeIfPresent([String: LessonRecord].self, forKey: .lessons) ?? d.lessons
        passedUnitTests = try c.decodeIfPresent([Int: Date].self, forKey: .passedUnitTests) ?? d.passedUnitTests
        completedLabs = try c.decodeIfPresent([String: Date].self, forKey: .completedLabs) ?? d.completedLabs
        xpByDay = try c.decodeIfPresent([DayKey: Int].self, forKey: .xpByDay) ?? d.xpByDay
        streak = try c.decodeIfPresent(StreakState.self, forKey: .streak) ?? d.streak
        hearts = try c.decodeIfPresent(HeartState.self, forKey: .hearts) ?? d.hearts
        mistakes = try c.decodeIfPresent([String: MistakeMemory].self, forKey: .mistakes) ?? d.mistakes
        masteredMistakes = try c.decodeIfPresent(Int.self, forKey: .masteredMistakes) ?? d.masteredMistakes
        cards = try c.decodeIfPresent([String: CardMemory].self, forKey: .cards) ?? d.cards
        cardReviews = try c.decodeIfPresent(Int.self, forKey: .cardReviews) ?? d.cardReviews
        answered = try c.decodeIfPresent(Int.self, forKey: .answered) ?? d.answered
        answeredFirstTryCorrect = try c.decodeIfPresent(Int.self, forKey: .answeredFirstTryCorrect) ?? d.answeredFirstTryCorrect
        perfectLessons = try c.decodeIfPresent(Int.self, forKey: .perfectLessons) ?? d.perfectLessons
        achievements = try c.decodeIfPresent([String: Date].self, forKey: .achievements) ?? d.achievements
        settings = try c.decodeIfPresent(Settings.self, forKey: .settings) ?? d.settings
    }
}

extension ProgressState.Settings {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = ProgressState.Settings()
        dailyGoal = try c.decodeIfPresent(Int.self, forKey: .dailyGoal) ?? d.dailyGoal
        heartsEnabled = try c.decodeIfPresent(Bool.self, forKey: .heartsEnabled) ?? d.heartsEnabled
        freeMode = try c.decodeIfPresent(Bool.self, forKey: .freeMode) ?? d.freeMode
        hapticsEnabled = try c.decodeIfPresent(Bool.self, forKey: .hapticsEnabled) ?? d.hapticsEnabled
        reminderEnabled = try c.decodeIfPresent(Bool.self, forKey: .reminderEnabled) ?? d.reminderEnabled
        reminderHour = try c.decodeIfPresent(Int.self, forKey: .reminderHour) ?? d.reminderHour
        reminderMinute = try c.decodeIfPresent(Int.self, forKey: .reminderMinute) ?? d.reminderMinute
    }
}
