import Foundation

/// 学习路径上的一个关卡。每章一个单元：课程 → 实验 → 课程 → 口述卡 → 单元测验。
struct PathNode: Identifiable, Hashable, Sendable {
    enum Kind: Hashable, Sendable {
        case lesson(Lesson)
        case labs([Lab])
        case cards([Card])
        case unitTest
    }

    let id: String
    let chapter: Int
    let kind: Kind

    /// 必修关卡决定后面能否解锁；实验和口述卡是选修，不挡路。
    var isRequired: Bool {
        switch kind {
        case .lesson, .unitTest: true
        case .labs, .cards: false
        }
    }

    var title: String {
        switch kind {
        case let .lesson(lesson): lesson.title
        case let .labs(labs): labs.count == 1 ? String(localized: "交互实验") : String(localized: "交互实验 ×\(labs.count)")
        case let .cards(cards): String(localized: "口述练习 ×\(cards.count)")
        case .unitTest: String(localized: "单元测验")
        }
    }

    var subtitle: String {
        switch kind {
        case let .lesson(lesson): lesson.summary
        case let .labs(labs): labs.map(\.title).joined(separator: "；")
        case .cards: String(localized: "合上书，把答案讲出来，再对照参考答案自评")
        case .unitTest: String(localized: "从本单元各课抽 \(SessionBuilder.unitTestSize) 题，全部答对即通关")
        }
    }

    var symbol: String {
        switch kind {
        case .lesson: "star.fill"
        case .labs: "flask.fill"
        case .cards: "mic.fill"
        case .unitTest: "trophy.fill"
        }
    }
}

enum NodeState: Equatable, Sendable {
    case locked
    case available
    /// 当前该学的关卡（第一个未完成的必修关卡）。
    case current
    case completed
    /// 需要完整版的章节：不受自由模式影响，点按弹出付费墙。
    case premium
}

enum LearningPath {
    static func nodes(for chapter: Chapter, cards: [Card]) -> [PathNode] {
        var nodes = chapter.lessons.map { PathNode(id: $0.id, chapter: chapter.number, kind: .lesson($0)) }
        if !chapter.labs.isEmpty {
            let lab = PathNode(id: String(format: "c%02d-labs", chapter.number), chapter: chapter.number, kind: .labs(chapter.labs))
            nodes.insert(lab, at: min(2, nodes.count))
        }
        if !cards.isEmpty {
            nodes.append(PathNode(id: String(format: "c%02d-cards", chapter.number), chapter: chapter.number, kind: .cards(cards)))
        }
        if !chapter.lessons.isEmpty {
            nodes.append(PathNode(id: String(format: "c%02d-test", chapter.number), chapter: chapter.number, kind: .unitTest))
        }
        return nodes
    }

    static func allNodes(in library: CourseLibrary) -> [PathNode] {
        library.chapters.flatMap { nodes(for: $0, cards: library.cards(chapter: $0.number)) }
    }

    /// 计算整条路径上每个关卡的状态。关卡解锁条件：它之前的必修关卡都已完成（自由模式下全部解锁）。
    /// 未购买的章节一律是 `.premium`，不占当前关卡、也不挡后面的关卡；自由模式不能绕过它。
    static func states(for nodes: [PathNode], isCompleted: (PathNode) -> Bool, freeMode: Bool,
                       isChapterUnlocked: (Int) -> Bool = { _ in true }) -> [String: NodeState] {
        var result: [String: NodeState] = [:]
        var blocked = false
        var currentAssigned = false
        for node in nodes {
            if !isChapterUnlocked(node.chapter) {
                result[node.id] = .premium
                continue
            }
            let done = isCompleted(node)
            if done {
                result[node.id] = .completed
            } else if blocked && !freeMode {
                result[node.id] = .locked
            } else if node.isRequired && !currentAssigned {
                result[node.id] = .current
                currentAssigned = true
            } else {
                result[node.id] = .available
            }
            if node.isRequired && !done { blocked = true }
        }
        return result
    }
}
