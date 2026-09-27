import Foundation
import Observation

enum SessionKind: Hashable, Sendable {
    /// 学习路径上的一课。
    case lesson(id: String)
    /// 单元末尾的综合测验。
    case unitTest(chapter: Int)
    /// 错题复习。
    case mistakes
    /// 从已学内容里随机抽题，可赚回红心。
    case practice

    /// 只有闯关（课程、单元测验）答错才扣红心；复习和练习不扣。
    var costsHearts: Bool {
        switch self {
        case .lesson, .unitTest: true
        case .mistakes, .practice: false
        }
    }
}

enum XPRules {
    static let lesson = 10
    static let perfectLessonBonus = 5
    static let unitTest = 20
    static let perfectUnitTestBonus = 10
    static let mistakes = 10
    static let practice = 10
    static let lab = 10
    static let card = 2

    static func xp(for result: SessionResult) -> Int {
        switch result.kind {
        case .lesson: lesson + (result.isPerfect ? perfectLessonBonus : 0)
        case .unitTest: unitTest + (result.isPerfect ? perfectUnitTestBonus : 0)
        case .mistakes: mistakes
        case .practice: practice
        }
    }
}

struct AnswerOutcome: Equatable, Sendable {
    let correct: Bool
    /// 一次答对且（配对题）没配错过。
    let clean: Bool
    /// 这道题在本轮第一次出现。
    let firstAttempt: Bool
}

struct SessionResult: Equatable, Sendable {
    let kind: SessionKind
    let exerciseCount: Int
    let firstTryCorrect: Int
    let missedIDs: [String]
    let duration: TimeInterval

    var accuracy: Double { exerciseCount == 0 ? 1 : Double(firstTryCorrect) / Double(exerciseCount) }
    var isPerfect: Bool { missedIDs.isEmpty }
}

/// 一轮答题的状态机：答错的题会在本轮末尾再出一次，直到答对（与多邻国相同）。
@MainActor
@Observable
final class LessonSession {
    struct Item: Identifiable, Equatable {
        let id: Int
        let exercise: Exercise
        let presentation: Presentation
        let isRetry: Bool
    }

    enum Phase: Equatable {
        case answering
        case feedback(correct: Bool)
        case finished
    }

    let kind: SessionKind
    let startedAt: Date
    let uniqueCount: Int
    private(set) var items: [Item] = []
    private(set) var position = 0
    private(set) var phase: Phase = .answering
    private(set) var solved: Set<String> = []
    private(set) var missed: [String] = []
    private(set) var lastResponse: ExerciseResponse?
    /// 连续答对数，用于“连对 N 题”的鼓励。
    private(set) var combo = 0
    private var rng: SeededGenerator
    private var nextID = 0

    init(kind: SessionKind, exercises: [Exercise], seed: UInt64 = .random(in: 1...UInt64.max), now: Date = .now) {
        self.kind = kind
        self.startedAt = now
        self.rng = SeededGenerator(seed: seed)
        var seen = Set<String>()
        let unique = exercises.filter { seen.insert($0.id).inserted }
        uniqueCount = unique.count
        items = unique.map { makeItem($0, isRetry: false) }
        if items.isEmpty { phase = .finished }
    }

    var current: Item? { position < items.count ? items[position] : nil }
    var progress: Double { uniqueCount == 0 ? 1 : Double(solved.count) / Double(uniqueCount) }
    var isFinished: Bool { phase == .finished }
    var remainingRetries: Int { items[position...].filter(\.isRetry).count }

    @discardableResult
    func submit(_ response: ExerciseResponse) -> AnswerOutcome? {
        guard phase == .answering, let item = current else { return nil }
        let correct = Grader.isCorrect(item.exercise, response)
        let clean = correct && Grader.isFirstTryClean(response)
        let firstAttempt = !item.isRetry
        lastResponse = response
        if correct {
            solved.insert(item.exercise.id)
            combo += 1
        } else {
            combo = 0
            items.append(makeItem(item.exercise, isRetry: true))
        }
        if (!correct || !clean), !missed.contains(item.exercise.id) {
            missed.append(item.exercise.id)
        }
        phase = .feedback(correct: correct)
        return AnswerOutcome(correct: correct, clean: clean, firstAttempt: firstAttempt)
    }

    func advance() {
        guard case .feedback = phase else { return }
        position += 1
        lastResponse = nil
        phase = position < items.count ? .answering : .finished
    }

    func result(at now: Date = .now) -> SessionResult {
        SessionResult(kind: kind, exerciseCount: uniqueCount,
                      firstTryCorrect: uniqueCount - missed.count,
                      missedIDs: missed, duration: now.timeIntervalSince(startedAt))
    }

    private func makeItem(_ exercise: Exercise, isRetry: Bool) -> Item {
        defer { nextID += 1 }
        return Item(id: nextID, exercise: exercise,
                    presentation: Presentation.make(for: exercise, using: &rng), isRetry: isRetry)
    }
}

/// 组卷：单元测验、错题复习、随机练习各自从哪里抽题。
enum SessionBuilder {
    static let unitTestSize = 12
    static let mistakeSessionSize = 12
    static let practiceSize = 10

    /// 单元测验：每课轮流抽，尽量覆盖全部课和多种题型。
    static func unitTest(for chapter: Chapter, using rng: inout some RandomNumberGenerator) -> [Exercise] {
        var pools = chapter.lessons.map { $0.exercises.shuffled(using: &rng) }
        var picked: [Exercise] = []
        while picked.count < unitTestSize, pools.contains(where: { !$0.isEmpty }) {
            for i in pools.indices where !pools[i].isEmpty && picked.count < unitTestSize {
                picked.append(pools[i].removeFirst())
            }
        }
        return picked.shuffled(using: &rng)
    }

    /// 随机练习：从已完成的课里抽，错题本里的题优先。
    static func practice(from exercises: [Exercise], weak: Set<String>, using rng: inout some RandomNumberGenerator) -> [Exercise] {
        let weakOnes = exercises.filter { weak.contains($0.id) }.shuffled(using: &rng)
        let others = exercises.filter { !weak.contains($0.id) }.shuffled(using: &rng)
        let weakCount = min(weakOnes.count, practiceSize / 2)
        let picked = Array(weakOnes.prefix(weakCount)) + Array(others.prefix(practiceSize - weakCount))
        return picked.shuffled(using: &rng)
    }
}
