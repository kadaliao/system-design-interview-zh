import Foundation
import Testing
@testable import SystemDesignQuest

/// 界面字符串本地化：源语言 zh-Hans（key 即中文原文），翻译 en。
struct LocalizationTests {
    private static let catalogURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("SystemDesignQuest/Resources/Localizable.xcstrings")

    private struct Catalog: Decodable {
        let sourceLanguage: String
        let strings: [String: Entry]
    }
    private struct Entry: Decodable {
        let localizations: [String: Localization]?
    }
    private struct Localization: Decodable {
        let stringUnit: Unit?
        let variations: Variations?
        let substitutions: [String: Substitution]?
    }
    private struct Unit: Decodable { let state: String; let value: String }
    private struct Variations: Decodable { let plural: [String: Variant]? }
    private struct Variant: Decodable { let stringUnit: Unit? }
    private struct Substitution: Decodable {
        let argNum: Int
        let formatSpecifier: String
        let variations: Variations
    }

    private func loadCatalog() throws -> Catalog {
        try JSONDecoder().decode(Catalog.self, from: Data(contentsOf: Self.catalogURL))
    }

    /// 按位置取出格式占位符：[(位置, 类型)]，`%1$@`、`%lld`、`%@` 都认。
    private func placeholders(_ format: String) -> [String] {
        let pattern = #"%(?:(\d+)\$)?(lld|ld|d|@|f)"#
        let regex = try! NSRegularExpression(pattern: pattern)
        var next = 1
        var result: [String] = []
        for match in regex.matches(in: format, range: NSRange(format.startIndex..., in: format)) {
            let ns = format as NSString
            let position = match.range(at: 1).location == NSNotFound ? next : Int(ns.substring(with: match.range(at: 1)))!
            if match.range(at: 1).location == NSNotFound { next += 1 }
            result.append("\(position):\(ns.substring(with: match.range(at: 2)))")
        }
        return result.sorted()
    }

    /// 把 `%#@name@` 展开成指定复数形态，`%arg` 换成带位置的占位符。
    private func expanded(_ loc: Localization, category: String) -> [String] {
        if let variants = loc.variations?.plural {
            return variants.compactMap { category == "*" || $0.key == category ? $0.value.stringUnit?.value : nil }
        }
        guard let unit = loc.stringUnit else { return [] }
        guard let subs = loc.substitutions, !subs.isEmpty else { return [unit.value] }
        var results = [unit.value]
        for (name, sub) in subs {
            var next: [String] = []
            for text in results {
                for variant in sub.variations.plural?.values ?? [:].values {
                    guard let value = variant.stringUnit?.value else { continue }
                    let arg = value.replacingOccurrences(of: "%arg", with: "%\(sub.argNum)$\(sub.formatSpecifier)")
                    next.append(text.replacingOccurrences(of: "%#@\(name)@", with: arg))
                }
            }
            results = next
        }
        return results
    }

    @Test func 每个key都有完整的英文翻译() throws {
        let catalog = try loadCatalog()
        #expect(catalog.sourceLanguage == "zh-Hans")
        #expect(catalog.strings.count > 200)
        for (key, entry) in catalog.strings {
            guard let en = entry.localizations?["en"] else {
                Issue.record("缺少英文翻译：\(key)")
                continue
            }
            var units: [Unit] = []
            if let unit = en.stringUnit { units.append(unit) }
            units += (en.variations?.plural ?? [:]).values.compactMap(\.stringUnit)
            for sub in (en.substitutions ?? [:]).values { units += (sub.variations.plural ?? [:]).values.compactMap(\.stringUnit) }
            #expect(!units.isEmpty, "英文翻译为空：\(key)")
            for unit in units {
                #expect(unit.state == "translated", "状态不是 translated：\(key)")
                #expect(!unit.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, "英文值为空：\(key)")
                #expect(unit.value.range(of: #"[\u4E00-\u9FFF]"#, options: .regularExpression) == nil, "英文里混入汉字：\(key) -> \(unit.value)")
            }
        }
    }

    @Test func 英文占位符与中文key一致() throws {
        let catalog = try loadCatalog()
        for (key, entry) in catalog.strings {
            guard let en = entry.localizations?["en"] else { continue }
            let expected = placeholders(key)
            for text in expanded(en, category: "*") {
                #expect(placeholders(text) == expected, "占位符不一致：\(key) -> \(text) \(placeholders(text)) vs \(expected)")
            }
        }
    }

    @Test func 英文复数形态齐全() throws {
        let catalog = try loadCatalog()
        var pluralKeys = 0
        for (key, entry) in catalog.strings {
            guard let en = entry.localizations?["en"] else { continue }
            if let plural = en.variations?.plural {
                pluralKeys += 1
                #expect(plural["one"] != nil && plural["other"] != nil, "复数缺 one/other：\(key)")
            }
            for sub in (en.substitutions ?? [:]).values {
                pluralKeys += 1
                #expect(sub.variations.plural?["one"] != nil && sub.variations.plural?["other"] != nil, "复数缺 one/other：\(key)")
            }
        }
        #expect(pluralKeys >= 8)
    }

    // MARK: - 用 en 的 Bundle 验证关键文案

    private func englishBundle() throws -> Bundle {
        let path = try #require(Bundle(for: ProgressStore.self).path(forResource: "en", ofType: "lproj"), "包里没有 en.lproj")
        return try #require(Bundle(path: path))
    }

    private func chineseBundle() throws -> Bundle {
        let path = try #require(Bundle(for: ProgressStore.self).path(forResource: "zh-Hans", ofType: "lproj"), "包里没有 zh-Hans.lproj")
        return try #require(Bundle(path: path))
    }

    @Test func Tab标题和关键按钮在英文下() throws {
        let bundle = try englishBundle()
        func en(_ key: String) -> String { bundle.localizedString(forKey: key, value: nil, table: nil) }
        #expect(en("学习") == "Learn")
        #expect(en("练习") == "Practice")
        #expect(en("我的") == "Profile")
        #expect(en("设置") == "Settings")
        #expect(en("解锁完整版") == "Unlock Full Version")
        #expect(en("恢复购买") == "Restore Purchase")
    }

    @Test func 中文下沿用源语言() throws {
        let bundle = try chineseBundle()
        #expect(bundle.localizedString(forKey: "学习", value: nil, table: nil) == "学习")
        #expect(bundle.localizedString(forKey: "我的", value: nil, table: nil) == "我的")
    }

    @Test func 英文复数与数字插值() throws {
        let bundle = try englishBundle()
        let locale = Locale(identifier: "en_US")
        #expect(String(localized: "还有 \(1) 颗红心", bundle: bundle, locale: locale) == "1 heart left")
        #expect(String(localized: "还有 \(3) 颗红心", bundle: bundle, locale: locale) == "3 hearts left")
        #expect(String(localized: "红心 \(1) 颗", bundle: bundle, locale: locale) == "1 heart")
        #expect(String(localized: "连胜 \(1) 天", bundle: bundle, locale: locale) == "Streak: 1 day")
        #expect(String(localized: "连胜 \(12) 天", bundle: bundle, locale: locale) == "Streak: 12 days")
        #expect(String(localized: "第 \(4) 单元测验", bundle: bundle, locale: locale) == "Unit 4 Quiz")
        #expect(String(localized: "\(3) 道 · 已掌握 \(2) 道", bundle: bundle, locale: locale) == "3 mistakes · 2 mastered")
        #expect(String(localized: "再得 \(20) XP，大约 \(1) 课", bundle: bundle, locale: locale) == "20 XP to go · about 1 lesson")
    }

    @Test func 成就文案随语言() throws {
        // 成就标题是 String(localized:) 在首次访问时按当前语言取的，这里只确认 13 枚都有英文 key
        let catalog = try loadCatalog()
        let source = try String(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("SystemDesignQuest/Store/Achievements.swift"), encoding: .utf8)
        let regex = try NSRegularExpression(pattern: #"String\(localized: "([^"]+)"\)"#)
        let keys = regex.matches(in: source, range: NSRange(source.startIndex..., in: source)).map {
            String(source[Range($0.range(at: 1), in: source)!])
        }
        #expect(keys.count == Achievements.all.count * 2)
        for key in keys { #expect(catalog.strings[key]?.localizations?["en"] != nil, "成就缺英文：\(key)") }
    }

    @Test func 视频时长随locale格式化() {
        #expect(VideoFormat.duration(224.1, locale: Locale(identifier: "en_US")) == "3 min, 44 sec")
        #expect(VideoFormat.duration(224.1, locale: Locale(identifier: "zh_Hans_CN")).contains("44"))
    }
}
