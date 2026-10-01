import Foundation
import UserNotifications

/// 每日学习提醒：排好未来 7 天的本地通知，今天已经学过就跳过今天。
enum ReminderScheduler {
    private static let prefix = "daily-reminder-"
    private static let horizon = 7

    static func requestAuthorization() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    @MainActor
    static func reschedule(for store: ProgressStore) {
        let settings = store.settings
        let studiedToday = store.studiedToday
        let streak = store.streak
        let calendar = store.calendar
        let now = store.now
        // 不能在主线程上等通知中心的同步 XPC 回复，否则启动时界面会卡住
        Task.detached {
            let center = UNUserNotificationCenter.current()
            let ids = (0..<horizon).map { "\(prefix)\($0)" }
            center.removePendingNotificationRequests(withIdentifiers: ids)
            guard settings.reminderEnabled else { return }
            let status = await center.notificationSettings().authorizationStatus
            guard status == .authorized || status == .provisional else { return }
            for offset in 0..<horizon {
                if offset == 0 && studiedToday { continue }
                guard let day = calendar.date(byAdding: .day, value: offset, to: now) else { continue }
                var parts = calendar.dateComponents([.year, .month, .day], from: day)
                parts.hour = settings.reminderHour
                parts.minute = settings.reminderMinute
                guard let fire = calendar.date(from: parts), fire > now else { continue }
                let content = UNMutableNotificationContent()
                content.title = String(localized: "该练系统设计了")
                content.body = message(offset: offset, streak: streak)
                content.sound = .default
                let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
                try? await center.add(UNNotificationRequest(identifier: ids[offset], content: content, trigger: trigger))
            }
        }
    }

    private static func message(offset: Int, streak: Int) -> String {
        if offset == 0 && streak > 0 {
            return String(localized: "已经连续学习 \(streak) 天，今天做一课就能续上。")
        }
        let lines = [
            String(localized: "花 5 分钟闯一关：限流、分片、幂等，今天练哪个？"),
            String(localized: "错题本里有题到期了，趁现在复习最省力。"),
            String(localized: "合上书讲一道面试题，比再读一遍记得牢。"),
        ]
        return lines[offset % lines.count]
    }
}
