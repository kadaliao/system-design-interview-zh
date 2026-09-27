import Foundation

/// 只读的课程内容与索引。启动时从 App 包内的 `Content/course.json` 加载一次。
final class CourseLibrary: Sendable {
    let course: Course
    private let exercisesByID: [String: Exercise]
    private let lessonsByID: [String: Lesson]
    private let chaptersByNumber: [Int: Chapter]
    private let cardsByID: [String: Card]

    init(course: Course) {
        self.course = course
        var exercises: [String: Exercise] = [:]
        var lessons: [String: Lesson] = [:]
        for chapter in course.chapters {
            for lesson in chapter.lessons {
                lessons[lesson.id] = lesson
                for exercise in lesson.exercises { exercises[exercise.id] = exercise }
            }
        }
        exercisesByID = exercises
        lessonsByID = lessons
        chaptersByNumber = Dictionary(uniqueKeysWithValues: course.chapters.map { ($0.number, $0) })
        cardsByID = Dictionary(uniqueKeysWithValues: course.cards.map { ($0.id, $0) })
    }

    static let contentDirectory = "Content"

    static func loadBundled(bundle: Bundle = .main) throws -> CourseLibrary {
        guard let url = bundle.url(forResource: "course", withExtension: "json", subdirectory: contentDirectory) else {
            throw CocoaError(.fileNoSuchFile, userInfo: [NSLocalizedDescriptionKey: "App 包内缺少 Content/course.json"])
        }
        let data = try Data(contentsOf: url)
        return CourseLibrary(course: try JSONDecoder().decode(Course.self, from: data))
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

    func cards(chapter: Int) -> [Card] { course.cards.filter { $0.chapter == chapter } }

    func section(of chapter: Int) -> CourseSection? {
        course.sections.first { $0.chapters.contains(chapter) }
    }

    /// 在线阅读版链接，`anchor` 形如 `d4` 或 `d4/1-令牌桶token-bucket`。
    func readerURL(anchor: String) -> URL {
        var components = URLComponents(url: course.readerURL, resolvingAgainstBaseURL: false)!
        components.fragment = anchor
        return components.url ?? course.readerURL
    }
}
