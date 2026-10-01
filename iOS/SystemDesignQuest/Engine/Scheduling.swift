import Foundation

// MARK: - 日期

/// 本地日历中的一天，存成 `yyyy-MM-dd`，连胜和每日 XP 都按它计。
struct DayKey: Codable, Hashable, Comparable, Sendable, CustomStringConvertible {
    let year: Int
    let month: Int
    let day: Int

    init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    init(_ date: Date, calendar: Calendar) {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        self.init(year: c.year!, month: c.month!, day: c.day!)
    }

    init?(string: String) {
        let parts = string.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        self.init(year: parts[0], month: parts[1], day: parts[2])
    }

    var description: String { String(format: "%04d-%02d-%02d", year, month, day) }

    /// 当天中午，避开夏令时切换导致的零点问题。
    func date(in calendar: Calendar) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
    }

    func adding(days: Int, calendar: Calendar) -> DayKey {
        DayKey(calendar.date(byAdding: .day, value: days, to: date(in: calendar))!, calendar: calendar)
    }

    /// 从 self 到 other 相隔的天数。
    func days(to other: DayKey, calendar: Calendar) -> Int {
        calendar.dateComponents([.day], from: date(in: calendar), to: other.date(in: calendar)).day!
    }

    static func < (a: DayKey, b: DayKey) -> Bool {
        (a.year, a.month, a.day) < (b.year, b.month, b.day)
    }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        guard let key = DayKey(string: raw) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "日期格式错误：\(raw)"))
        }
        self = key
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(description)
    }
}

extension DayKey: CodingKeyRepresentable {
    private struct Key: CodingKey {
        let stringValue: String
        var intValue: Int? { nil }
        init(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }

    var codingKey: CodingKey { Key(stringValue: description) }

    init?<T: CodingKey>(codingKey: T) {
        self.init(string: codingKey.stringValue)
    }
}

// MARK: - 红心

/// 课程和单元测验里答错扣一颗红心，每 30 分钟恢复一颗，练习模式可以赚回红心。
struct HeartState: Codable, Equatable, Sendable {
    static let maximum = 5
    static let refillInterval: TimeInterval = 30 * 60

    private(set) var stored = HeartState.maximum
    /// 开始计算下一颗恢复的时刻；满心时为 nil。
    private(set) var refillAnchor: Date?

    func count(at now: Date) -> Int { normalized(at: now).stored }

    func nextRefill(at now: Date) -> Date? {
        let n = normalized(at: now)
        return n.refillAnchor.map { $0.addingTimeInterval(HeartState.refillInterval) }
    }

    func normalized(at now: Date) -> HeartState {
        var copy = self
        guard copy.stored < HeartState.maximum, let anchor = copy.refillAnchor else {
            copy.refillAnchor = nil
            copy.stored = min(copy.stored, HeartState.maximum)
            return copy
        }
        let gained = Int(max(0, now.timeIntervalSince(anchor)) / HeartState.refillInterval)
        copy.stored = min(HeartState.maximum, copy.stored + gained)
        copy.refillAnchor = copy.stored >= HeartState.maximum
            ? nil : anchor.addingTimeInterval(Double(gained) * HeartState.refillInterval)
        return copy
    }

    mutating func lose(at now: Date) {
        self = normalized(at: now)
        guard stored > 0 else { return }
        if stored == HeartState.maximum { refillAnchor = now }
        stored -= 1
    }

    mutating func gain(_ n: Int = 1, at now: Date) {
        self = normalized(at: now)
        stored = min(HeartState.maximum, stored + n)
        if stored == HeartState.maximum { refillAnchor = nil }
    }

    mutating func refill() {
        stored = HeartState.maximum
        refillAnchor = nil
    }
}

// MARK: - 连胜

enum StreakEvent: Equatable, Sendable {
    /// 今天已经算过了。
    case alreadyCounted
    case started
    case extended(to: Int)
    /// 中间断了几天，用连胜保护补上。
    case protected(usedFreezes: Int, to: Int)
    /// 断了，从 1 重新开始。
    case reset(from: Int)
}

/// 每天完成至少一次学习就续上连胜；每连续 7 天奖励一次连胜保护（最多存 2 次），断一天自动消耗。
struct StreakState: Codable, Equatable, Sendable {
    static let maxFreezes = 2

    private(set) var current = 0
    private(set) var longest = 0
    private(set) var lastActiveDay: DayKey?
    private(set) var freezes = 0
    /// 被保护补上的日子，日历上单独标出。
    private(set) var frozenDays: [DayKey] = []

    /// 今天还没学时显示的连胜：昨天学过就仍是 current；断档且保护不够则为 0。
    func displayed(today: DayKey, calendar: Calendar) -> Int {
        guard let last = lastActiveDay else { return 0 }
        let gap = last.days(to: today, calendar: calendar)
        if gap <= 1 { return current }
        return gap - 1 <= freezes ? current : 0
    }

    func isActive(on day: DayKey) -> Bool { lastActiveDay == day }

    @discardableResult
    mutating func registerActivity(on today: DayKey, calendar: Calendar) -> StreakEvent {
        guard let last = lastActiveDay else {
            current = 1
            lastActiveDay = today
            longest = max(longest, current)
            return .started
        }
        let gap = last.days(to: today, calendar: calendar)
        let event: StreakEvent
        if gap <= 0 {
            return .alreadyCounted
        } else if gap == 1 {
            current += 1
            event = .extended(to: current)
        } else if gap - 1 <= freezes {
            let missed = gap - 1
            freezes -= missed
            frozenDays += (1...missed).map { last.adding(days: $0, calendar: calendar) }
            current += 1
            event = .protected(usedFreezes: missed, to: current)
        } else {
            let previous = current
            current = 1
            event = .reset(from: previous)
        }
        lastActiveDay = today
        longest = max(longest, current)
        if current > 1, current % 7 == 0 { freezes = min(StreakState.maxFreezes, freezes + 1) }
        return event
    }
}

// MARK: - 错题复习（Leitner 盒子）

/// 答错的题进入 1 号盒，当场就可复习；每答对一次升一盒，间隔 1、3、7、16 天，5 号盒再答对即“已掌握”，移出错题本。
struct MistakeMemory: Codable, Equatable, Sendable {
    static let intervals: [TimeInterval] = [1, 3, 7, 16].map { $0 * 86_400 }
    static let lastBox = 5

    private(set) var box = 1
    private(set) var due: Date
    private(set) var lapses = 1
    private(set) var firstMissed: Date

    init(missedAt now: Date) {
        due = now
        firstMissed = now
    }

    func isDue(at now: Date) -> Bool { due <= now }

    mutating func missed(at now: Date) {
        box = 1
        due = now
        lapses += 1
    }

    /// 返回 false 表示已经掌握，应移出错题本。
    mutating func answeredCorrectly(at now: Date) -> Bool {
        guard box < MistakeMemory.lastBox else { return false }
        due = now.addingTimeInterval(MistakeMemory.intervals[box - 1])
        box += 1
        return true
    }
}

// MARK: - 口述卡（简化 SM-2）

enum CardGrade: Int, Codable, CaseIterable, Sendable {
    case again, hard, good, easy

    var label: String {
        switch self {
        case .again: String(localized: "没想起来")
        case .hard: String(localized: "想起一部分")
        case .good: String(localized: "基本讲清")
        case .easy: String(localized: "讲得很透")
        }
    }
}

struct CardMemory: Codable, Equatable, Sendable {
    static let masteredInterval: Double = 21

    private(set) var ease = 2.5
    /// 天。
    private(set) var interval: Double = 0
    private(set) var due: Date
    private(set) var reps = 0
    private(set) var lapses = 0
    private(set) var lastGrade: CardGrade?
    private(set) var lastReviewed: Date

    init(now: Date) {
        due = now
        lastReviewed = now
    }

    var isMastered: Bool { interval >= CardMemory.masteredInterval }
    func isDue(at now: Date) -> Bool { due <= now }

    mutating func review(_ grade: CardGrade, at now: Date) {
        switch grade {
        case .again:
            ease = max(1.3, ease - 0.2)
            interval = 0
            reps = 0
            lapses += 1
        case .hard:
            ease = max(1.3, ease - 0.15)
            interval = max(1, interval * 1.2)
            reps += 1
        case .good:
            interval = interval == 0 ? 1 : (reps <= 1 ? max(3, interval * ease) : interval * ease)
            reps += 1
        case .easy:
            ease += 0.15
            interval = interval == 0 ? 4 : interval * ease * 1.3
            reps += 1
        }
        interval = min(interval, 365)
        // 没想起来的卡十分钟后再来
        due = grade == .again ? now.addingTimeInterval(600) : now.addingTimeInterval(interval * 86_400)
        lastGrade = grade
        lastReviewed = now
    }
}
