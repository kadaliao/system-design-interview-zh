import Foundation

/// 学习者对一道题的作答。选项用原始下标表示，与显示顺序无关。
enum ExerciseResponse: Equatable, Sendable {
    case single(Int)
    case multi(Set<Int>)
    case judge(Bool)
    case fill([String])
    case order([String])
    /// 配对题全部配完才提交；`mistakes` 是配错的次数。
    case match(mistakes: Int)
}

enum Grader {
    static func isCorrect(_ exercise: Exercise, _ response: ExerciseResponse) -> Bool {
        switch (exercise.kind, response) {
        case let (.single(_, answer), .single(choice)):
            return choice == answer
        case let (.multi(_, answers), .multi(choices)):
            return choices == answers
        case let (.judge(answer), .judge(choice)):
            return choice == answer
        case let (.fill(_, answers, _), .fill(filled)):
            return filled == answers
        case let (.order(items), .order(arranged)):
            return arranged == items
        case (.match, .match):
            // 配错的格子会当场提示并让学习者重配，全部配完即算完成；
            // 是否一次配对成功由 `isFirstTryClean` 判断，决定是否记入错题本。
            return true
        default:
            return false
        }
    }

    /// 配对题中途配错也算“不够熟”，记入错题本复习。
    static func isFirstTryClean(_ response: ExerciseResponse) -> Bool {
        if case let .match(mistakes) = response { return mistakes == 0 }
        return true
    }

    /// 答错时展示给学习者的正确答案。
    static func correctAnswerText(_ exercise: Exercise) -> String {
        switch exercise.kind {
        case let .single(options, answer):
            return options[answer]
        case let .multi(options, answers):
            return answers.sorted().map { options[$0] }.joined(separator: "；")
        case let .judge(answer):
            return answer ? String(localized: "正确") : String(localized: "错误")
        case let .fill(segments, answers, _):
            return segments.map { segment in
                switch segment {
                case let .text(text): text
                case let .blank(index): "【\(answers[index])】"
                }
            }.joined()
        case let .order(items):
            return items.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n")
        case let .match(pairs):
            return pairs.map { "\($0.left) — \($0.right)" }.joined(separator: "\n")
        }
    }
}

/// 一道题这一次出现时的显示顺序。每次出现都重新打乱，避免记位置。
struct Presentation: Sendable, Hashable {
    /// 显示位置 → 原始选项下标（单选、多选）。
    var optionOrder: [Int] = []
    /// 填空题的词块。
    var chips: [String] = []
    /// 排序题打乱后的待选项。
    var shuffledItems: [String] = []
    /// 配对题左右两列各自的显示顺序（原始 pair 下标）。
    var leftOrder: [Int] = []
    var rightOrder: [Int] = []

    static func make(for exercise: Exercise, using rng: inout some RandomNumberGenerator) -> Presentation {
        var p = Presentation()
        switch exercise.kind {
        case let .single(options, _), let .multi(options, _):
            p.optionOrder = Array(options.indices).shuffled(using: &rng)
        case .judge:
            break
        case let .fill(_, answers, distractors):
            p.chips = (answers + distractors).shuffled(using: &rng)
        case let .order(items):
            var shuffled = items.shuffled(using: &rng)
            // 打乱后恰好还是正确顺序就没意义了
            if items.count > 1 {
                while shuffled == items { shuffled.shuffle(using: &rng) }
            }
            p.shuffledItems = shuffled
        case let .match(pairs):
            p.leftOrder = Array(pairs.indices).shuffled(using: &rng)
            var right = Array(pairs.indices).shuffled(using: &rng)
            if pairs.count > 1 {
                while right == p.leftOrder { right.shuffle(using: &rng) }
            }
            p.rightOrder = right
        }
        return p
    }
}

/// 可复现的随机数，测试和“今日”抽题用。
struct SeededGenerator: RandomNumberGenerator, Sendable {
    private var state: UInt64

    init(seed: UInt64) { state = seed == 0 ? 0x9E37_79B9_7F4A_7C15 : seed }

    mutating func next() -> UInt64 {
        // SplitMix64
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}
