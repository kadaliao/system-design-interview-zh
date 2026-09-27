import SwiftUI

/// 一轮结束后的结算页：经验、正确率、用时、连胜和新成就。
struct LessonResultView: View {
    let result: SessionResult
    let celebration: Celebration
    let title: String
    let onContinue: () -> Void
    @State private var appeared = false

    var body: some View {
        VStack(spacing: 22) {
            Spacer(minLength: 20)
            ZStack {
                Circle()
                    .fill(accent.opacity(0.15))
                    .frame(width: 150, height: 150)
                    .scaleEffect(appeared ? 1 : 0.4)
                Image(systemName: symbol)
                    .font(.system(size: 72, weight: .heavy))
                    .foregroundStyle(accent)
                    .scaleEffect(appeared ? 1 : 0.2)
                    .rotationEffect(.degrees(appeared ? 0 : -30))
            }
            .animation(.spring(response: 0.55, dampingFraction: 0.55), value: appeared)
            VStack(spacing: 6) {
                Text(headline)
                    .font(.rounded(30, .heavy))
                    .foregroundStyle(accent)
                Text(title)
                    .font(.rounded(16, .semibold))
                    .foregroundStyle(Palette.secondaryText)
            }
            HStack(spacing: 12) {
                ResultTile(title: "获得经验", value: "+\(celebration.xp)", symbol: "bolt.fill", color: Palette.gold)
                ResultTile(title: result.isPerfect ? "一次全对" : "一次答对",
                           value: "\(Int((result.accuracy * 100).rounded()))%", symbol: "scope", color: Palette.green)
                ResultTile(title: "用时", value: duration, symbol: "clock.fill", color: Palette.blue)
            }
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 20)
            .animation(.easeOut(duration: 0.4).delay(0.2), value: appeared)

            VStack(alignment: .leading, spacing: 12) {
                if let streakLine {
                    Label(streakLine, systemImage: "flame.fill")
                        .foregroundStyle(Palette.orange)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Label(celebration.goalJustReached ? "今日目标达成！" : "今日目标 \(celebration.todayXP)/\(celebration.dailyGoal) XP",
                          systemImage: "target")
                        .foregroundStyle(celebration.goalJustReached ? Palette.correctText : Palette.text)
                    ProgressBar(value: Double(celebration.todayXP) / Double(max(1, celebration.dailyGoal)), fill: Palette.gold, height: 12)
                }
                if celebration.heartsGained > 0 {
                    Label("赚回 \(celebration.heartsGained) 颗红心", systemImage: "heart.fill")
                        .foregroundStyle(Palette.red)
                }
                if !result.missedIDs.isEmpty {
                    Label("\(result.missedIDs.count) 道题已记入错题本，到「练习」里复习", systemImage: "book.closed.fill")
                        .foregroundStyle(Palette.secondaryText)
                }
                ForEach(celebration.newAchievements, id: \.self) { id in
                    if let achievement = Achievements.all.first(where: { $0.id == id }) {
                        Label("解锁成就：\(achievement.title)", systemImage: achievement.symbol)
                            .foregroundStyle(Palette.purpleShadow)
                    }
                }
            }
            .font(.rounded(16, .bold))
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16).fill(Palette.surface))
            .opacity(appeared ? 1 : 0)
            .animation(.easeOut(duration: 0.4).delay(0.35), value: appeared)
            Spacer()
            Button("继续", action: onContinue)
                .buttonStyle(ChunkyButtonStyle())
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 8)
        .readableWidth(560)
        .onAppear {
            appeared = true
            Haptics.success()
        }
    }

    private var accent: Color {
        switch result.kind {
        case .unitTest: Palette.goldShadow
        case .practice, .mistakes: Palette.blue
        case .lesson: Palette.greenShadow
        }
    }

    private var symbol: String {
        switch result.kind {
        case .unitTest: "trophy.fill"
        case .practice: "dumbbell.fill"
        case .mistakes: "arrow.uturn.backward.circle.fill"
        case .lesson: result.isPerfect ? "star.circle.fill" : "checkmark.seal.fill"
        }
    }

    private var headline: String {
        switch result.kind {
        case .unitTest: "单元通关！"
        case .practice: "练习完成！"
        case .mistakes: "复习完成！"
        case .lesson: result.isPerfect ? "全对通关！" : "本课完成！"
        }
    }

    private var duration: String {
        let seconds = Int(result.duration.rounded())
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    private var streakLine: String? {
        switch celebration.streakEvent {
        case .alreadyCounted: nil
        case .started: "连胜开始！明天再来就是 2 天"
        case let .extended(to): "连胜 \(to) 天！"
        case let .protected(used, to): "用掉 \(used) 次连胜保护，连胜 \(to) 天"
        case let .reset(from): "之前的 \(from) 天连胜断了，今天重新开始"
        }
    }
}

private struct ResultTile: View {
    let title: String
    let value: String
    let symbol: String
    let color: Color

    var body: some View {
        VStack(spacing: 0) {
            Text(title)
                .font(.rounded(12, .heavy))
                .foregroundStyle(.white)
                .padding(.vertical, 5)
                .frame(maxWidth: .infinity)
            HStack(spacing: 4) {
                Image(systemName: symbol)
                Text(value).monospacedDigit()
            }
            .font(.rounded(19, .heavy))
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(RoundedRectangle(cornerRadius: 12).fill(Palette.card))
            .padding(2)
        }
        .background(RoundedRectangle(cornerRadius: 14).fill(color))
    }
}
