import SwiftUI

/// 一轮答题：顶部进度条和红心，中间题目，底部「检查」与对错反馈。
struct LessonScreen: View {
    let session: LessonSession
    let title: String
    @Environment(ProgressStore.self) private var store
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var draft = AnswerDraft()
    @State private var celebration: Celebration?
    @State private var failed = false
    @State private var confirmQuit = false
    @State private var link: WebLink?
    @State private var praise = LessonScreen.praises.randomElement()!

    static let praises = [String(localized: "答对了！"), String(localized: "漂亮！"), String(localized: "正确！"),
                          String(localized: "太棒了！"), String(localized: "思路清楚！"), String(localized: "稳！")]

    var body: some View {
        VStack(spacing: 0) {
            if let celebration {
                LessonResultView(result: session.result(), celebration: celebration, title: title) {
                    dismiss()
                }
            } else if failed {
                OutOfHeartsInLesson {
                    dismiss()
                } onPractice: {
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { router.startPractice(store: store) }
                }
            } else {
                header
                if let item = session.current {
                    ScrollView {
                        ExerciseContent(item: item, draft: $draft, phase: session.phase) { mistakes in
                            submit(.match(mistakes: mistakes))
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 12)
                        .padding(.bottom, 24)
                        .readableWidth()
                    }
                    .scrollBounceBehavior(.basedOnSize)
                    .id(item.id)
                    .transition(.asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading)))
                    bottomBar(item)
                }
            }
        }
        .screenBackground()
        .confirmationDialog("现在退出，这一轮的进度不会保存。", isPresented: $confirmQuit, titleVisibility: .visible) {
            Button("退出", role: .destructive) { dismiss() }
            Button("继续学习", role: .cancel) {}
        }
        .sheet(item: $link) { SafariView(url: $0.url).ignoresSafeArea() }
        .onChange(of: session.phase) { _, phase in
            if phase == .finished && celebration == nil {
                celebration = store.finish(session.result())
            }
        }
    }

    private var header: some View {
        HStack(spacing: 14) {
            Button {
                if session.solved.isEmpty { dismiss() } else { confirmQuit = true }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(Palette.lockedIcon)
                    .frame(width: 32, height: 32)
            }
            .accessibilityLabel("退出")
            ProgressBar(value: session.progress)
            if session.kind.costsHearts && store.heartsEnabled {
                StatPill(symbol: "heart.fill", value: "\(store.hearts)", color: Palette.red)
                    .contentTransition(.numericText())
                    .animation(.default, value: store.hearts)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .readableWidth()
    }

    @ViewBuilder
    private func bottomBar(_ item: LessonSession.Item) -> some View {
        switch session.phase {
        case .answering:
            VStack {
                if case .match = item.exercise.kind {
                    Text("配完所有格子自动进入下一步")
                        .font(.rounded(14, .semibold))
                        .foregroundStyle(Palette.secondaryText)
                        .frame(height: 54)
                } else {
                    Button("检查") {
                        if let response = draft.response(for: item) { submit(response) }
                    }
                    .buttonStyle(ChunkyButtonStyle())
                    .disabled(draft.response(for: item) == nil)
                }
            }
            .readableWidth()
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 8)
            .overlay(alignment: .top) { Divider().overlay(Palette.border) }
        case let .feedback(correct):
            FeedbackPanel(exercise: item.exercise, correct: correct, praise: praise, combo: session.combo,
                          onReference: item.exercise.refAnchor.map { anchor in
                              { link = WebLink(url: store.library.readerURL(anchor: anchor)) }
                          },
                          onContinue: next)
                .transition(.move(edge: .bottom))
        case .finished:
            EmptyView()
        }
    }

    private func submit(_ response: ExerciseResponse) {
        guard let item = session.current, let outcome = session.submit(response) else { return }
        store.record(outcome, for: item.exercise, in: session.kind)
        if case let .match(mistakes) = response, mistakes > 0 {
            praise = String(localized: "配完了，错了 \(mistakes) 次")
        } else {
            praise = session.combo >= 3 ? String(localized: "连对 \(session.combo) 题！") : LessonScreen.praises.randomElement()!
        }
        if outcome.correct { Haptics.success() } else { Haptics.error() }
    }

    private func next() {
        if session.kind.costsHearts && store.heartsEnabled && store.hearts == 0 {
            withAnimation { failed = true }
            return
        }
        withAnimation(.easeInOut(duration: 0.25)) {
            session.advance()
            draft = AnswerDraft()
        }
    }
}

/// 当前这道题尚未提交的作答。
struct AnswerDraft: Equatable {
    var single: Int?
    var multi: Set<Int> = []
    var judge: Bool?
    /// 每个空填入的词块下标（指向 presentation.chips）。
    var fill: [Int?] = []
    /// 已选的排序项下标（指向 presentation.shuffledItems）。
    var order: [Int] = []

    func response(for item: LessonSession.Item) -> ExerciseResponse? {
        let p = item.presentation
        switch item.exercise.kind {
        case .single:
            return single.map(ExerciseResponse.single)
        case .multi:
            return multi.isEmpty ? nil : .multi(multi)
        case .judge:
            return judge.map(ExerciseResponse.judge)
        case let .fill(_, answers, _):
            guard fill.count == answers.count, fill.allSatisfy({ $0 != nil }) else { return nil }
            return .fill(fill.map { p.chips[$0!] })
        case let .order(items):
            guard order.count == items.count else { return nil }
            return .order(order.map { p.shuffledItems[$0] })
        case .match:
            return nil
        }
    }
}

struct FeedbackPanel: View {
    let exercise: Exercise
    let correct: Bool
    let praise: String
    let combo: Int
    let onReference: (() -> Void)?
    let onContinue: () -> Void

    var body: some View {
        let tint = correct ? Palette.correctText : Palette.wrongText
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: correct ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .font(.system(size: 28, weight: .bold))
                Text(correct ? praise : String(localized: "差一点"))
                    .font(.rounded(22, .heavy))
                Spacer()
                if let onReference {
                    Button(action: onReference) {
                        Label("回看原文", systemImage: "book.fill")
                            .font(.rounded(14, .bold))
                    }
                    .buttonStyle(.plain)
                }
            }
            .foregroundStyle(tint)
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    if !correct, !isMatch {
                        Text("正确答案")
                            .font(.rounded(15, .heavy))
                            .foregroundStyle(tint)
                        RichText(Grader.correctAnswerText(exercise))
                            .font(.rounded(16, .semibold))
                            .foregroundStyle(tint)
                    }
                    RichText(exercise.explanation)
                        .font(.rounded(15))
                        .foregroundStyle(Palette.text)
                        .lineSpacing(3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 220)
            .fixedSize(horizontal: false, vertical: true)
            Button(correct ? continueLabel : gotItLabel) { onContinue() }
                .buttonStyle(correct ? ChunkyButtonStyle() : ChunkyButtonStyle(fill: Palette.red, shadow: Palette.redShadow))
                .padding(.top, 4)
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
        .readableWidth()
        .background((correct ? Palette.correctBackground : Palette.wrongBackground).ignoresSafeArea(edges: .bottom))
    }

    private var isMatch: Bool { if case .match = exercise.kind { true } else { false } }
    private var continueLabel: LocalizedStringKey { "继续" }
    private var gotItLabel: LocalizedStringKey { "知道了" }
}

private struct OutOfHeartsInLesson: View {
    let onQuit: () -> Void
    let onPractice: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "heart.slash.fill")
                .font(.system(size: 72, weight: .bold))
                .foregroundStyle(Palette.red)
            Text("红心用完了")
                .font(.rounded(28, .heavy))
                .foregroundStyle(Palette.text)
            Text("这一轮没能完成。红心每 30 分钟恢复一颗；做一轮随机练习不扣红心，完成后还能赚回一颗。")
                .font(.rounded(16))
                .foregroundStyle(Palette.secondaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 28)
            Spacer()
            Button("练习赚红心", action: onPractice)
                .buttonStyle(ChunkyButtonStyle(fill: Palette.blue, shadow: Palette.blueShadow))
            Button("退出", action: onQuit)
                .font(.rounded(16, .bold))
                .foregroundStyle(Palette.secondaryText)
                .padding(.bottom, 8)
        }
        .padding(.horizontal, 24)
    }
}
