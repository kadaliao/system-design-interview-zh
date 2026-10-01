import Foundation
import os

/// 只读的课程内容与索引。启动时从 App 包内的 `Content/course.json` 加载一次。
final class CourseLibrary: Sendable {
    let course: Course
    private let exercisesByID: [String: Exercise]
    private let lessonsByID: [String: Lesson]
    private let chaptersByNumber: [Int: Chapter]
    private let cardsByID: [String: Card]
    private let chapterByLessonID: [String: Int]
    private let chapterByLabID: [String: Int]

    let language: AppLanguage

    init(course: Course, language: AppLanguage = .zh) {
        self.course = course
        self.language = language
        var exercises: [String: Exercise] = [:]
        var lessons: [String: Lesson] = [:]
        var lessonChapters: [String: Int] = [:]
        var labChapters: [String: Int] = [:]
        for chapter in course.chapters {
            for lab in chapter.labs { labChapters[lab.id] = chapter.number }
            for lesson in chapter.lessons {
                lessons[lesson.id] = lesson
                lessonChapters[lesson.id] = chapter.number
                for exercise in lesson.exercises { exercises[exercise.id] = exercise }
            }
        }
        exercisesByID = exercises
        chapterByLessonID = lessonChapters
        chapterByLabID = labChapters
        lessonsByID = lessons
        chaptersByNumber = Dictionary(uniqueKeysWithValues: course.chapters.map { ($0.number, $0) })
        cardsByID = Dictionary(uniqueKeysWithValues: course.cards.map { ($0.id, $0) })
    }

    static let contentDirectory = "Content"

    /// 按语言加载；英文包缺失或解码失败时回退中文并记录日志。
    static func loadBundled(bundle: Bundle = .main, language: AppLanguage = .current) throws -> CourseLibrary {
        if language == .en {
            if let library = try? load(resource: "course.en", language: .en, bundle: bundle) { return library }
            Logger(subsystem: "app.systemdesignquest", category: "content")
                .error("Content/course.en.json 缺失或无法解码，回退中文内容")
        }
        return try load(resource: "course", language: .zh, bundle: bundle)
    }

    private static func load(resource: String, language: AppLanguage, bundle: Bundle) throws -> CourseLibrary {
        guard let url = bundle.url(forResource: resource, withExtension: "json", subdirectory: contentDirectory) else {
            throw CocoaError(.fileNoSuchFile, userInfo: [NSLocalizedDescriptionKey: "App 包内缺少 Content/\(resource).json"])
        }
        let data = try Data(contentsOf: url)
        return CourseLibrary(course: try JSONDecoder().decode(Course.self, from: data), language: language)
    }

    static func imageURL(_ name: String, bundle: Bundle = .main) -> URL? {
        bundle.url(forResource: name, withExtension: nil, subdirectory: "\(contentDirectory)/images")
    }

    var chapters: [Chapter] { course.chapters }
    var allExercises: [Exercise] { course.chapters.flatMap { $0.lessons.flatMap(\.exercises) } }

    func exercise(_ id: String) -> Exercise? { exercisesByID[id] }
    func lesson(_ id: String) -> Lesson? { lessonsByID[id] }
    func chapter(_ number: Int) -> Chapter? { chaptersByNumber[number] }
    func card(_ id: String) -> Card? { cardsByID[id] }
    func chapter(ofLesson id: String) -> Int? { chapterByLessonID[id] }
    func chapter(ofLab id: String) -> Int? { chapterByLabID[id] }

    func cards(chapter: Int) -> [Card] { course.cards.filter { $0.chapter == chapter } }

    func section(of chapter: Int) -> CourseSection? {
        course.sections.first { $0.chapters.contains(chapter) }
    }

    /// 在线阅读版链接，`anchor` 形如 `d4` 或 `d4/1-令牌桶token-bucket`。
    /// 英文版指向上游英文笔记对应章节（无对应章，如通用复盘卡 `d29/…`，指向仓库首页）。
    func readerURL(anchor: String) -> URL {
        if language == .en {
            return ReadingLinks.chapter(fromAnchor: anchor).map(ReadingLinks.upstreamChapterURL) ?? ReadingLinks.upstreamRepo
        }
        var components = URLComponents(url: course.readerURL, resolvingAgainstBaseURL: false)!
        components.fragment = anchor
        return components.url ?? course.readerURL
    }

    /// 设置页的「在线阅读版」。
    var readerHomeURL: URL { ReadingLinks.readerHome(language: language, zhReader: course.readerURL) }
}
