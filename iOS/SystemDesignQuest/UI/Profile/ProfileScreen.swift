import Charts
import SwiftUI

/// 我的：统计、每日目标、本周经验、连胜日历和成就。
struct ProfileScreen: View {
    @Environment(ProgressStore.self) private var store

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    statsGrid
                    goalCard
                    weekChart
                    StreakCalendar()
                    achievements
                }
                .padding(20)
                .readableWidth()
            }
            .screenBackground()
            .navigationTitle("我的进度")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        SettingsScreen()
                    } label: {
                        Image(systemName: "gearshape.fill")
                    }
                    .accessibilityLabel("设置")
                }
            }
        }
    }

    private var statsGrid: some View {
        let totalLessons = store.library.chapters.reduce(0) { $0 + $1.lessons.count }
        let accuracy = store.state.answered == 0 ? 0 : Double(store.state.answeredFirstTryCorrect) / Double(store.state.answered)
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 12) {
            StatTile(symbol: "flame.fill", color: Palette.orange, value: "\(store.streak)", title: "连胜天数",
                     detail: "最长 \(store.state.streak.longest) 天 · 保护 \(store.state.streak.freezes)")
            StatTile(symbol: "bolt.fill", color: Palette.gold, value: "\(store.state.totalXP)", title: "总经验",
                     detail: "学习 \(store.state.xpByDay.filter { $0.value > 0 }.count) 天")
            StatTile(symbol: "checkmark.circle.fill", color: Palette.green, value: "\(store.completedLessonCount)/\(totalLessons)",
                     title: "完成课程", detail: "通关单元 \(store.passedUnitCount)/\(store.library.chapters.count)")
            StatTile(symbol: "scope", color: Palette.blue, value: "\(Int((accuracy * 100).rounded()))%", title: "一次答对率",
                     detail: "共答 \(store.state.answered) 题")
            StatTile(symbol: "mic.fill", color: Palette.purple, value: "\(store.masteredCardCount)/\(store.library.course.cards.count)",
                     title: "掌握口述卡", detail: "自评 \(store.state.cardReviews) 次")
            StatTile(symbol: "flask.fill", color: Color(hex: 0x2EC4B6),
                     value: "\(store.state.completedLabs.count)/\(store.library.chapters.reduce(0) { $0 + $1.labs.count })",
                     title: "完成实验", detail: "错题已掌握 \(store.state.masteredMistakes)")
        }
    }

    private var goalCard: some View {
        HStack(spacing: 18) {
            ZStack {
                Circle().stroke(Palette.locked, lineWidth: 12)
                Circle()
                    .trim(from: 0, to: store.goalProgress)
                    .stroke(Palette.gold, style: StrokeStyle(lineWidth: 12, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Image(systemName: store.goalProgress >= 1 ? "checkmark" : "bolt.fill")
                    .font(.system(size: 26, weight: .heavy))
                    .foregroundStyle(Palette.gold)
            }
            .frame(width: 78, height: 78)
            VStack(alignment: .leading, spacing: 4) {
                Text("今日目标")
                    .font(.rounded(14, .heavy))
                    .foregroundStyle(Palette.secondaryText)
                Text("\(store.todayXP) / \(store.dailyGoal) XP")
                    .font(.rounded(24, .heavy))
                    .foregroundStyle(Palette.text)
                Text(goalHint)
                    .font(.rounded(14))
                    .foregroundStyle(Palette.secondaryText)
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .modifier(CardBackground())
    }

    private var goalHint: LocalizedStringKey {
        if store.goalProgress >= 1 { return "今天的目标完成了，明天继续！" }
        let remaining = store.dailyGoal - store.todayXP
        let lessons = Int(ceil(Double(remaining) / 10))
        return "再得 \(remaining) XP，大约 \(lessons) 课"
    }

    private var weekChart: some View {
        let data = store.recentXP()
        return VStack(alignment: .leading, spacing: 12) {
            Text("最近 7 天")
                .font(.rounded(18, .heavy))
                .foregroundStyle(Palette.text)
            Chart {
                ForEach(data, id: \.day) { entry in
                    BarMark(x: .value("日期", weekday(entry.day)), y: .value("XP", entry.xp), width: .ratio(0.55))
                        .foregroundStyle(entry.day == store.today ? Palette.gold : Palette.green)
                        .cornerRadius(6)
                        .annotation(position: .top) {
                            if entry.xp > 0 {
                                Text("\(entry.xp)").font(.rounded(11, .bold)).foregroundStyle(Palette.secondaryText)
                            }
                        }
                }
                RuleMark(y: .value("目标", store.dailyGoal))
                    .foregroundStyle(Palette.gold.opacity(0.7))
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
            }
            .chartYAxis {
                AxisMarks(position: .leading) { _ in
                    AxisGridLine().foregroundStyle(Palette.border)
                    AxisValueLabel().font(.rounded(11))
                }
            }
            .chartXAxis {
                AxisMarks { _ in AxisValueLabel().font(.rounded(12, .semibold)) }
            }
            .frame(height: 170)
        }
        .padding(18)
        .modifier(CardBackground())
    }

    private func weekday(_ day: DayKey) -> String {
        if day == store.today { return String(localized: "今天") }
        return day.date(in: store.calendar).formatted(.dateTime.weekday(.abbreviated))
    }

    private var achievements: some View {
        let stats = store.achievementStats
        return VStack(alignment: .leading, spacing: 12) {
            Text("成就")
                .font(.rounded(18, .heavy))
                .foregroundStyle(Palette.text)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 12)], spacing: 14) {
                ForEach(Achievements.all) { achievement in
                    let unlocked = store.state.achievements[achievement.id] != nil
                    VStack(spacing: 6) {
                        Image(systemName: achievement.symbol)
                            .font(.system(size: 26, weight: .bold))
                            .foregroundStyle(unlocked ? .white : Palette.lockedIcon)
                            .frame(width: 58, height: 58)
                            .background(Circle().fill(unlocked ? Palette.gold : Palette.locked))
                            .overlay(Circle().strokeBorder(unlocked ? Palette.goldShadow : Palette.lockedShadow, lineWidth: 3))
                        Text(achievement.title)
                            .font(.rounded(13, .bold))
                            .foregroundStyle(unlocked ? Palette.text : Palette.secondaryText)
                        Text(unlocked ? achievement.detail : "\(achievement.progress(stats))/\(achievement.target)")
                            .font(.rounded(11))
                            .foregroundStyle(Palette.secondaryText)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(achievement.title)，\(achievement.detail)，\(unlocked ? String(localized: "已解锁") : String(localized: "进度 \(achievement.progress(stats))/\(achievement.target)"))")
                }
            }
        }
        .padding(18)
        .modifier(CardBackground())
    }
}

private struct StatTile: View {
    let symbol: String
    let color: Color
    let value: String
    let title: LocalizedStringKey
    let detail: LocalizedStringKey

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(color)
                Text(value)
                    .font(.rounded(22, .heavy))
                    .foregroundStyle(Palette.text)
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
            }
            Text(title)
                .font(.rounded(14, .bold))
                .foregroundStyle(Palette.text)
            Text(detail)
                .font(.rounded(12))
                .foregroundStyle(Palette.secondaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(CardBackground())
    }
}

struct CardBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Palette.card))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.border, lineWidth: 2))
    }
}

/// 本月日历：学过的日子标绿，连胜保护补上的日子标蓝。
private struct StreakCalendar: View {
    @Environment(ProgressStore.self) private var store
    @State private var monthOffset = 0

    var body: some View {
        let calendar = store.calendar
        let month = calendar.date(byAdding: .month, value: monthOffset, to: store.now)!
        let interval = calendar.dateInterval(of: .month, for: month)!
        let firstWeekday = calendar.component(.weekday, from: interval.start)
        let leading = (firstWeekday - calendar.firstWeekday + 7) % 7
        let days = calendar.range(of: .day, in: .month, for: month)!.count
        let frozen = Set(store.state.streak.frozenDays)
        VStack(spacing: 12) {
            HStack {
                Text(month.formatted(.dateTime.year().month(.wide)))
                    .font(.rounded(18, .heavy))
                    .foregroundStyle(Palette.text)
                Spacer()
                Button { monthOffset -= 1 } label: { Image(systemName: "chevron.left") }
                    .accessibilityLabel("上个月")
                Button { monthOffset += 1 } label: { Image(systemName: "chevron.right") }
                    .disabled(monthOffset >= 0)
                    .accessibilityLabel("下个月")
            }
            .font(.system(size: 16, weight: .bold))
            let symbols = calendar.veryShortStandaloneWeekdaySymbols
            let ordered = Array(symbols[(calendar.firstWeekday - 1)...] + symbols[..<(calendar.firstWeekday - 1)])
            // 星期、月初空格、日期放进同一组带唯一 id 的格子；分几组 ForEach 时整数 id 会互相冲突
            let cells: [(id: String, day: Int?, label: String?)] =
                ordered.enumerated().map { ("w\($0.offset)", nil, $0.element) }
                + (0..<leading).map { ("b\($0)", nil, nil) }
                + (1...days).map { ("d\($0)", $0, nil) }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 6) {
                ForEach(cells, id: \.id) { cell in
                    if let label = cell.label {
                        Text(label).font(.rounded(12, .bold)).foregroundStyle(Palette.secondaryText)
                    } else if let day = cell.day {
                        let key = DayKey(calendar.date(byAdding: .day, value: day - 1, to: interval.start)!, calendar: calendar)
                        let active = (store.state.xpByDay[key] ?? 0) > 0
                        Text("\(day)")
                            .font(.rounded(14, active ? .heavy : .medium))
                            .foregroundStyle(active || frozen.contains(key) ? .white : Palette.text)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(active ? Palette.orange : (frozen.contains(key) ? Palette.blue : Color.clear)))
                            .overlay(Circle().strokeBorder(key == store.today ? Palette.orange : .clear, lineWidth: 2))
                    } else {
                        Color.clear.frame(height: 32)
                    }
                }
            }
            HStack(spacing: 16) {
                legend(Palette.orange, "学习过")
                legend(Palette.blue, "连胜保护")
                Spacer()
            }
            .font(.rounded(12))
            .foregroundStyle(Palette.secondaryText)
        }
        .padding(18)
        .modifier(CardBackground())
    }

    private func legend(_ color: Color, _ text: LocalizedStringKey) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 10, height: 10)
            Text(text)
        }
    }
}
