import Foundation

/// 「阅读本章全文」「回看原文」等外链。中文指向中文在线阅读站（`course.readerURL`），
/// 英文暂指向上游英文笔记；以后有自己的英文阅读站，只改这里的常量。
enum ReadingLinks {
    static let upstreamRepo = URL(string: "https://github.com/liquidslr/system-design-notes")!
    static let upstreamBase = "https://github.com/liquidslr/system-design-notes/tree/main/"
    static let ownRepo = URL(string: "https://github.com/kadaliao/system-design-interview-zh")!

    /// 上游各章目录名（第 N 章 = 下标 N-1）。第 27 章目录名里确有两个空格。
    static let upstreamDirectories = [
        "01. Scaling", "02. Back Of the Envelope Estimation", "03. System Design Framework", "04. Rate Limiter",
        "05. Consistent Hashing", "06. Key-Value Store", "07. Unique-Id Generator", "08. URL Shortener",
        "09. Web Crawler", "10. Notification System", "11. News Feed System", "12. Chat System",
        "13. Search Autocomplete", "14. Youtube", "15. Google Drive", "16. Proximity Service",
        "17. Nearby Friends", "18. Google Maps", "19. Distributed Message Queue",
        "20. Metrics Monitoring and Alerting System", "21. Ad Click Event Aggregation",
        "22. Hotel Reservation System", "23. Distributed Email Service", "24. S3-like Object Storage",
        "25. Real-time Gaming Leaderboard", "26. Payment System", "27.  Digital Wallet", "28. Stock Exchange",
    ]

    static func upstreamChapterURL(_ chapter: Int) -> URL {
        guard (1...upstreamDirectories.count).contains(chapter),
              let encoded = upstreamDirectories[chapter - 1].addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: upstreamBase + encoded) else { return upstreamRepo }
        return url
    }

    /// 从 `d4`、`d4/1-令牌桶…` 这类锚点取章号；`d29/…`（通用复盘卡）等无对应章返回 nil。
    static func chapter(fromAnchor anchor: String) -> Int? {
        let head = anchor.split(separator: "/", maxSplits: 1).first.map(String.init) ?? anchor
        guard head.hasPrefix("d"), let n = Int(head.dropFirst()), (1...upstreamDirectories.count).contains(n) else { return nil }
        return n
    }

    /// 隐私政策页面地址。**页面需要你自己发布**：正文草稿在 `发布/privacy.md`，填完其中的 `[…]` 后放到下面这两个地址（或改成你自己的域名），
    /// 上线前务必确认两个地址都能打开，并把同一个地址填进 App Store Connect 的「隐私政策 URL」。
    static let privacyPolicyZh = URL(string: "https://kadaliao.github.io/system-design-interview-zh/privacy.html")!
    static let privacyPolicyEn = URL(string: "https://kadaliao.github.io/system-design-interview-zh/privacy-en.html")!
    static func privacyPolicy(language: AppLanguage) -> URL { language == .en ? privacyPolicyEn : privacyPolicyZh }

    /// 设置页的「在线阅读版」「GitHub 仓库」。
    static func readerHome(language: AppLanguage, zhReader: URL) -> URL { language == .en ? upstreamRepo : zhReader }
    static func repo(language: AppLanguage) -> URL { language == .en ? upstreamRepo : ownRepo }
}
