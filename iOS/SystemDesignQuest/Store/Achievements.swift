import Foundation

/// 成就徽章。解锁条件只看进度快照，便于测试和补发。
struct Achievement: Identifiable, Sendable {
    let id: String
    let title: String
    let detail: String
    let symbol: String
    let target: Int
    let measure: @Sendable (AchievementStats) -> Int

    func progress(_ stats: AchievementStats) -> Int { min(target, measure(stats)) }
    func isUnlocked(_ stats: AchievementStats) -> Bool { measure(stats) >= target }
}

struct AchievementStats: Sendable {
    var lessonsCompleted = 0
    var perfectLessons = 0
    var unitsPassed = 0
    var longestStreak = 0
    var totalXP = 0
    var labsCompleted = 0
    var cardReviews = 0
    var mistakesMastered = 0
    var totalUnits = 28
}

enum Achievements {
    static let all: [Achievement] = [
        Achievement(id: "first-lesson", title: String(localized: "第一步"), detail: String(localized: "完成第一课"), symbol: "figure.walk", target: 1) { $0.lessonsCompleted },
        Achievement(id: "perfect-5", title: String(localized: "零失误"), detail: String(localized: "5 节课全部一次答对"), symbol: "checkmark.seal.fill", target: 5) { $0.perfectLessons },
        Achievement(id: "streak-3", title: String(localized: "三天不断"), detail: String(localized: "连续学习 3 天"), symbol: "flame.fill", target: 3) { $0.longestStreak },
        Achievement(id: "streak-7", title: String(localized: "一周打卡"), detail: String(localized: "连续学习 7 天"), symbol: "flame.circle.fill", target: 7) { $0.longestStreak },
        Achievement(id: "streak-30", title: String(localized: "月度坚持"), detail: String(localized: "连续学习 30 天"), symbol: "calendar.badge.checkmark", target: 30) { $0.longestStreak },
        Achievement(id: "unit-1", title: String(localized: "通关第一单元"), detail: String(localized: "通过一次单元测验"), symbol: "trophy.fill", target: 1) { $0.unitsPassed },
        Achievement(id: "unit-7", title: String(localized: "积木齐备"), detail: String(localized: "通过 7 个单元测验"), symbol: "square.stack.3d.up.fill", target: 7) { $0.unitsPassed },
        Achievement(id: "unit-all", title: String(localized: "系统设计通关"), detail: String(localized: "通过全部 28 个单元测验"), symbol: "crown.fill", target: 28) { $0.unitsPassed },
        Achievement(id: "xp-500", title: String(localized: "五百经验"), detail: String(localized: "累计获得 500 XP"), symbol: "bolt.fill", target: 500) { $0.totalXP },
        Achievement(id: "xp-3000", title: String(localized: "三千经验"), detail: String(localized: "累计获得 3,000 XP"), symbol: "bolt.shield.fill", target: 3000) { $0.totalXP },
        Achievement(id: "labs-10", title: String(localized: "动手派"), detail: String(localized: "完成 10 个交互实验"), symbol: "flask.fill", target: 10) { $0.labsCompleted },
        Achievement(id: "cards-30", title: String(localized: "开口就讲"), detail: String(localized: "口述自评 30 次"), symbol: "mic.fill", target: 30) { $0.cardReviews },
        Achievement(id: "mistakes-20", title: String(localized: "错题清道夫"), detail: String(localized: "掌握 20 道错题"), symbol: "arrow.uturn.backward.circle.fill", target: 20) { $0.mistakesMastered },
    ]
}
