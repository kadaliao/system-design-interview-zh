import Foundation
@testable import SystemDesignQuest

/// 测试用的小课程：两章，每章两课，覆盖全部题型。
enum Fixtures {
    static let json = """
    {
      "version": "test",
      "readerURL": "https://example.com/reader/",
      "sections": [{"id": "s1", "title": "起步", "subtitle": "测试", "chapters": [1, 2]}],
      "chapters": [
        {"number": 1, "title": "扩展", "fullTitle": "第 1 章", "docID": "d1", "intro": ["导读"], "introImage": null,
         "keyPoints": ["要点"],
         "labs": [{"id": "lab-a", "title": "实验", "summary": "摘要", "file": "01.js"}],
         "lessons": [
           {"id": "c01-01", "title": "第一课", "summary": "s", "exercises": [
             {"id": "c01-01-01", "type": "single", "prompt": "p", "explanation": "e", "options": ["a", "b", "c"], "answer": 1},
             {"id": "c01-01-02", "type": "judge", "prompt": "p", "explanation": "e", "answer": false},
             {"id": "c01-01-03", "type": "fill", "prompt": "p", "explanation": "e", "text": "令牌桶的 [[容量]] 管突发，[[速率]] 管长期。", "distractors": ["窗口"]}
           ]},
           {"id": "c01-02", "title": "第二课", "summary": "s", "exercises": [
             {"id": "c01-02-01", "type": "multi", "prompt": "p", "explanation": "e", "options": ["a", "b", "c", "d"], "answers": [0, 2]},
             {"id": "c01-02-02", "type": "order", "prompt": "p", "explanation": "e", "items": ["一", "二", "三"]},
             {"id": "c01-02-03", "type": "match", "prompt": "p", "explanation": "e", "pairs": [["A", "1"], ["B", "2"], ["C", "3"], ["D", "4"]],
              "refTitle": "小节", "refAnchor": "d1/小节"}
           ]}
         ]},
        {"number": 2, "title": "估算", "fullTitle": "第 2 章", "docID": "d2", "intro": [], "introImage": null,
         "keyPoints": [], "labs": [],
         "lessons": [
           {"id": "c02-01", "title": "第一课", "summary": "s", "exercises": [
             {"id": "c02-01-01", "type": "judge", "prompt": "p", "explanation": "e", "answer": true}
           ]}
         ]}
      ],
      "cards": [
        {"id": "Q01-01", "chapter": 1, "category": "章末自测", "question": "q", "conclusion": "c", "anchor": "q01-01",
         "blocks": [{"kind": "text", "text": "**结论。** 正文"}]}
      ]
    }
    """

    static func library() -> CourseLibrary {
        CourseLibrary(course: try! JSONDecoder().decode(Course.self, from: Data(json.utf8)))
    }

    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        return c
    }

    static func date(_ day: Int, hour: Int = 10, month: Int = 9, year: Int = 2026) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
    }
}

/// 可手动拨动的时钟。
@MainActor
final class TestClock {
    var now: Date
    init(_ now: Date) { self.now = now }
    func advance(_ seconds: TimeInterval) { now = now.addingTimeInterval(seconds) }
}
