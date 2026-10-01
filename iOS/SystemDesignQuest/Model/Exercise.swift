import Foundation

/// 一道闯关题。题型字段见 `练习题库/README.md`。
struct Exercise: Identifiable, Sendable, Hashable {
    enum Kind: Sendable, Hashable {
        case single(options: [String], answer: Int)
        case multi(options: [String], answers: Set<Int>)
        case judge(answer: Bool)
        case fill(segments: [FillSegment], answers: [String], distractors: [String])
        case order(items: [String])
        case match(pairs: [MatchPair])
    }

    let id: String
    let prompt: String
    let explanation: String
    let refTitle: String?
    let refAnchor: String?
    let kind: Kind

    /// 所属课的编号，如 `c04-02-07` → `c04-02`。
    var lessonID: String { String(id.prefix(6)) }
    /// 所属章号。
    var chapter: Int { Int(id.dropFirst().prefix(2)) ?? 0 }

    var typeLabel: String {
        switch kind {
        case .single: String(localized: "单选")
        case .multi: String(localized: "多选")
        case .judge: String(localized: "判断")
        case .fill: String(localized: "填空")
        case .order: String(localized: "排序")
        case .match: String(localized: "配对")
        }
    }

    /// 题目上方的动作提示，类似多邻国的「选择正确的翻译」。
    var instruction: String {
        switch kind {
        case .single: String(localized: "选出正确答案")
        case .multi: String(localized: "选出所有正确的选项")
        case .judge: String(localized: "这句话对吗？")
        case .fill: String(localized: "点选词块，填入空白")
        case .order: String(localized: "按正确顺序排列")
        case .match: String(localized: "把左右两列配成对")
        }
    }
}

enum FillSegment: Sendable, Hashable {
    case text(String)
    /// 第几个空（从 0 开始）。
    case blank(Int)
}

struct MatchPair: Sendable, Hashable {
    let left: String
    let right: String
}

extension Exercise: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, type, prompt, explanation, refTitle, refAnchor
        case options, answer, answers, text, distractors, items, pairs
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        prompt = try c.decode(String.self, forKey: .prompt)
        explanation = try c.decode(String.self, forKey: .explanation)
        refTitle = try c.decodeIfPresent(String.self, forKey: .refTitle)
        refAnchor = try c.decodeIfPresent(String.self, forKey: .refAnchor)
        let type = try c.decode(String.self, forKey: .type)
        switch type {
        case "single":
            kind = .single(options: try c.decode([String].self, forKey: .options),
                           answer: try c.decode(Int.self, forKey: .answer))
        case "multi":
            kind = .multi(options: try c.decode([String].self, forKey: .options),
                          answers: Set(try c.decode([Int].self, forKey: .answers)))
        case "judge":
            kind = .judge(answer: try c.decode(Bool.self, forKey: .answer))
        case "fill":
            let parsed = Exercise.parseFill(try c.decode(String.self, forKey: .text))
            kind = .fill(segments: parsed.segments, answers: parsed.answers,
                         distractors: try c.decode([String].self, forKey: .distractors))
        case "order":
            kind = .order(items: try c.decode([String].self, forKey: .items))
        case "match":
            let raw = try c.decode([[String]].self, forKey: .pairs)
            kind = .match(pairs: raw.map { MatchPair(left: $0[0], right: $0[1]) })
        default:
            throw DecodingError.dataCorruptedError(forKey: .type, in: c, debugDescription: "未知题型 \(type)")
        }
    }

    /// 把 `A [[答案]] B` 拆成文字段与空位。
    static func parseFill(_ text: String) -> (segments: [FillSegment], answers: [String]) {
        var segments: [FillSegment] = []
        var answers: [String] = []
        var rest = Substring(text)
        while let open = rest.range(of: "[["), let close = rest.range(of: "]]", range: open.upperBound..<rest.endIndex) {
            let before = rest[rest.startIndex..<open.lowerBound]
            if !before.isEmpty { segments.append(.text(String(before))) }
            segments.append(.blank(answers.count))
            answers.append(String(rest[open.upperBound..<close.lowerBound]))
            rest = rest[close.upperBound...]
        }
        if !rest.isEmpty { segments.append(.text(String(rest))) }
        return (segments, answers)
    }
}
