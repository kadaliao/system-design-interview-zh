import Foundation
import Testing
@testable import SystemDesignQuest

private func hasHan(_ s: String) -> Bool {
    s.unicodeScalars.contains { (0x4E00...0x9FFF).contains($0.value) || (0x3400...0x4DBF).contains($0.value) }
}

private func bundleURL(_ path: String) -> URL? {
    Bundle.main.url(forResource: path, withExtension: nil, subdirectory: "Content")
}

/// 一道题里所有给用户看的文字。
private func texts(_ e: Exercise) -> [String] {
    var out = [e.prompt, e.explanation, e.refTitle ?? ""]
    switch e.kind {
    case let .single(options, _), let .multi(options, _): out += options
    case .judge: break
    case let .fill(segments, answers, distractors):
        for case let .text(t) in segments { out.append(t) }
        out += answers + distractors
    case let .order(items): out += items
    case let .match(pairs): out += pairs.flatMap { [$0.left, $0.right] }
    }
    return out
}

/// 与语言无关的题目骨架：类型与答案位置。
private func shape(_ e: Exercise) -> String {
    switch e.kind {
    case let .single(options, answer): "single/\(options.count)/\(answer)"
    case let .multi(options, answers): "multi/\(options.count)/\(answers.sorted())"
    case let .judge(answer): "judge/\(answer)"
    case let .fill(_, answers, distractors): "fill/\(answers.count)/\(distractors.count)"
    case let .order(items): "order/\(items.count)"
    case let .match(pairs): "match/\(pairs.count)"
    }
}

@Suite("中英内容包")
@MainActor
struct ContentI18nTests {
    let zh: CourseLibrary
    let en: CourseLibrary

    init() throws {
        zh = try CourseLibrary.loadBundled(language: .zh)
        en = try CourseLibrary.loadBundled(language: .en)
    }

    @Test func 语言各自加载() {
        #expect(zh.language == .zh)
        #expect(en.language == .en)
        #expect(en.course.version != zh.course.version)
    }

    @Test func 英文包结构与中文一致() {
        #expect(en.chapters.map(\.number) == Array(1...28))
        #expect(en.course.sections.flatMap(\.chapters) == Array(1...28))
        #expect(en.course.sections.map(\.id) == zh.course.sections.map(\.id))
        // 口述卡顺序按各自语言的排序规则，只要求 id 集合与所属章一致
        #expect(Set(en.course.cards.map(\.id)) == Set(zh.course.cards.map(\.id)))
        for card in zh.course.cards {
            #expect(en.card(card.id)?.chapter == card.chapter, "\(card.id) 所属章不一致")
            #expect(en.card(card.id)?.anchor == card.anchor, "\(card.id) 锚点不一致")
        }
        for (z, e) in zip(zh.chapters, en.chapters) {
            #expect(z.docID == e.docID)
            #expect(z.lessons.map(\.id) == e.lessons.map(\.id), "第 \(z.number) 章课程 id")
            #expect(z.labs.map(\.id) == e.labs.map(\.id), "第 \(z.number) 章实验 id")
            #expect(z.keyPoints.count == e.keyPoints.count)
            #expect((z.introImage == nil) == (e.introImage == nil))
            for (zl, el) in zip(z.lessons, e.lessons) {
                #expect(zl.exercises.map(\.id) == el.exercises.map(\.id), "\(zl.id) 题目 id")
                for (ze, ee) in zip(zl.exercises, el.exercises) {
                    #expect(shape(ze) == shape(ee), "\(ze.id) 题型或答案位置不一致")
                }
            }
        }
        #expect(en.allExercises.count == zh.allExercises.count)
    }

    @Test func 英文包没有残留汉字() {
        var bad: [String] = []
        func check(_ id: String, _ strings: [String]) { if strings.contains(where: hasHan) { bad.append(id) } }
        for section in en.course.sections { check(section.id, [section.title, section.subtitle]) }
        for chapter in en.chapters {
            check("ch\(chapter.number)", [chapter.title, chapter.fullTitle] + chapter.intro + chapter.keyPoints)
            for lab in chapter.labs { check(lab.id, [lab.title, lab.summary]) }
            for lesson in chapter.lessons {
                check(lesson.id, [lesson.title, lesson.summary])
                for e in lesson.exercises { check(e.id, texts(e)) }
            }
        }
        for card in en.course.cards {
            var all = [card.category, card.question, card.conclusion]
            for block in card.blocks { all += [block.text ?? ""] + (block.rows ?? []).flatMap { $0 } }
            check(card.id, all)
        }
        #expect(bad.isEmpty, "英文包残留汉字：\(bad.prefix(10))")
    }

    @Test(arguments: [AppLanguage.zh, .en]) func 引用的图片与实验文件都在包里(_ language: AppLanguage) throws {
        let library = language == .zh ? zh : en
        for chapter in library.chapters {
            if let image = chapter.introImage { #expect(CourseLibrary.imageURL(image) != nil, "缺少导读图 \(image)") }
            for lab in chapter.labs {
                let url = try #require(bundleURL("Labs/labs/\(lab.file)"), "缺少实验 \(lab.file)")
                if language == .en {
                    #expect(lab.file.hasPrefix("en/"))
                    let source = try String(contentsOf: url, encoding: .utf8)
                    #expect(!hasHan(source), "\(lab.file) 残留汉字")
                }
            }
        }
        for card in library.course.cards {
            for block in card.blocks where block.kind == .image {
                #expect(CourseLibrary.imageURL(block.image ?? "") != nil, "缺少答案图 \(block.image ?? "")")
            }
        }
        if language == .en {
            #expect(en.chapters.compactMap(\.introImage).allSatisfy { $0.hasPrefix("en/") })
        }
    }

    @Test func 视频清单与打包视频一致() throws {
        let catalog = try #require(VideoCatalog.loadBundled())
        for language in AppLanguage.allCases {
            let asset = try #require(catalog.entry(chapter: 1)?.asset(version: catalog.version, language: language))
            #expect(asset.language == language)
            let url = try #require(catalog.bundledURL(for: asset), "第 1 章 \(language.rawValue) 视频没打包")
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize
            #expect(Int64(size ?? 0) == asset.info.bytes)
        }
        #expect(catalog.entry(chapter: 1)?.title(for: .en).isEmpty == false)
    }

    @Test func 进度按编号存储跨语言有效() throws {
        let file = FileManager.default.temporaryDirectory.appending(path: "progress-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: file) }
        let date = Fixtures.date(1)
        let first = ProgressStore(library: zh, fileURL: file, calendar: Fixtures.calendar, clock: { date })

        let lesson = try #require(zh.chapter(1)?.lessons.first)
        let missed = try #require(lesson.exercises.first)
        for exercise in lesson.exercises {
            let clean = exercise.id != missed.id
            first.record(AnswerOutcome(correct: clean, clean: clean, firstAttempt: true), for: exercise, in: .lesson(id: lesson.id))
        }
        first.finish(SessionResult(kind: .lesson(id: lesson.id), exerciseCount: lesson.exercises.count,
                                   firstTryCorrect: lesson.exercises.count - 1, missedIDs: [missed.id], duration: 60))
        let card = try #require(zh.course.cards.first)
        first.review(card, grade: .good)
        let lab = try #require(zh.chapter(1)?.labs.first)
        first.completeLab(lab)
        first.saveNow()

        let second = ProgressStore(library: en, fileURL: file, calendar: Fixtures.calendar, clock: { date })
        #expect(second.loadWarning == nil)
        #expect(second.mistakeIDs == [missed.id])
        #expect(en.exercise(missed.id) != nil)
        #expect(second.state.lessons[lesson.id] != nil)
        let node = try #require(second.pathNodes.first {
            if case let .lesson(l) = $0.kind { l.id == lesson.id } else { false }
        })
        #expect(second.isCompleted(node))
        #expect(second.state.cards[card.id] != nil)
        #expect(en.card(card.id) != nil)
        let enLab = try #require(en.chapter(1)?.labs.first)
        #expect(second.isLabCompleted(enLab))
        #expect(second.state.answered == lesson.exercises.count)
        #expect(second.state.totalXP == first.state.totalXP)
        #expect(second.unitProgress(1).done == first.unitProgress(1).done)
    }

    @Test func 语言判定() {
        #expect(AppLanguage.resolve(preferred: ["zh-Hant-HK"]) == .zh)
        #expect(AppLanguage.resolve(preferred: ["fr-FR"]) == .en)
    }

    @Test func 阅读链接() {
        // 中文：在线阅读站 + 锚点
        let zhURL = zh.readerURL(anchor: "d4/1-令牌桶token-bucket")
        #expect(zhURL.absoluteString.hasPrefix(zh.course.readerURL.absoluteString))
        #expect(zhURL.fragment != nil)
        // 英文：上游英文笔记对应章节目录
        #expect(en.readerURL(anchor: "d1").absoluteString
                == "https://github.com/liquidslr/system-design-notes/tree/main/01.%20Scaling")
        #expect(en.readerURL(anchor: "d4/1-令牌桶token-bucket").absoluteString.hasSuffix("/04.%20Rate%20Limiter"))
        #expect(en.readerURL(anchor: "d27").absoluteString.hasSuffix("/27.%20%20Digital%20Wallet"))
        #expect(en.readerURL(anchor: "d29/q01-01") == ReadingLinks.upstreamRepo)
        #expect(ReadingLinks.upstreamDirectories.count == 28)
        for n in 1...28 { #expect(ReadingLinks.upstreamChapterURL(n) != ReadingLinks.upstreamRepo) }
        for chapter in en.chapters { #expect(en.readerURL(anchor: chapter.docID) == ReadingLinks.upstreamChapterURL(chapter.number)) }
        #expect(en.readerHomeURL == ReadingLinks.upstreamRepo)
        #expect(zh.readerHomeURL == zh.course.readerURL)
        #expect(ReadingLinks.repo(language: .zh) != ReadingLinks.repo(language: .en))
    }
}
