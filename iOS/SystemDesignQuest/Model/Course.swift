import Foundation

/// 内容包 `Content/course.json` 的结构，由 `工具/build_app_content.py` 生成。
struct Course: Decodable, Sendable {
    let version: String
    let readerURL: URL
    let sections: [CourseSection]
    let chapters: [Chapter]
    let cards: [Card]
}

struct CourseSection: Decodable, Identifiable, Sendable {
    let id: String
    let title: String
    let subtitle: String
    let chapters: [Int]
}

struct Chapter: Decodable, Identifiable, Sendable {
    let number: Int
    let title: String
    let fullTitle: String
    let docID: String
    let intro: [String]
    let introImage: String?
    let keyPoints: [String]
    let lessons: [Lesson]
    let labs: [Lab]

    var id: Int { number }
}

struct Lesson: Decodable, Identifiable, Sendable, Hashable {
    let id: String
    let title: String
    let summary: String
    let exercises: [Exercise]
}

struct Lab: Decodable, Identifiable, Sendable, Hashable {
    let id: String
    let title: String
    let summary: String
    let file: String
}

/// 第 29 章的开放题：先口述，再对照参考答案自评。
struct Card: Decodable, Identifiable, Sendable, Hashable {
    let id: String
    /// 0 表示通用复盘题。
    let chapter: Int
    let category: String
    let question: String
    let conclusion: String
    let anchor: String
    let blocks: [CardBlock]
}

struct CardBlock: Decodable, Sendable, Hashable {
    enum Kind: String, Decodable, Sendable {
        case text, bullet, image, table
    }

    let kind: Kind
    let text: String?
    let image: String?
    let rows: [[String]]?
}
