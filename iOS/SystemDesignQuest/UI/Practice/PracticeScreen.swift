import SwiftUI

/// 练习中心：错题复习、口述练习、随机练习和错题本。
struct PracticeScreen: View {
    @Environment(ProgressStore.self) private var store
    @Environment(Router.self) private var router

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    mistakesCard
                    cardsCard
                    practiceCard
                    NavigationLink {
                        MistakeNotebookScreen()
                    } label: {
                        HStack {
                            Label("错题本", systemImage: "book.closed.fill")
                                .font(.rounded(17, .bold))
                            Spacer()
                            Text("\(store.mistakeIDs.count) 道 · 已掌握 \(store.state.masteredMistakes) 道")
                                .font(.rounded(14))
                                .foregroundStyle(Palette.secondaryText)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(Palette.lockedIcon)
                        }
                        .padding(16)
                    }
                    .buttonStyle(OutlineCardStyle())
                    if !store.entitlements.hasFullAccess {
                        Button {
                            router.paywall = .general
                        } label: {
                            Label("解锁完整版，练习覆盖全部章节", systemImage: "lock.open.fill")
                        }
                        .buttonStyle(ChunkyButtonStyle(fill: Palette.gold, shadow: Palette.goldShadow))
                    }
                }
                .padding(20)
                .readableWidth()
            }
            .screenBackground()
            .navigationTitle("练习")
        }
    }

    private var mistakesCard: some View {
        let due = store.dueMistakeIDs.count
        let total = store.mistakeIDs.count
        return PracticeCard(
            symbol: "arrow.uturn.backward.circle.fill", color: Palette.red, title: String(localized: "错题复习"),
            detail: total == 0 ? String(localized: "答错的题会自动进入错题本，按 1、3、7、16 天的间隔复习，连续答对 5 次即掌握。")
                : String(localized: "\(due) 道到期 · 错题本共 \(total) 道。复习答对升一级，答错回到第一级。"),
            buttonTitle: due > 0 ? String(localized: "复习 \(min(due, SessionBuilder.mistakeSessionSize)) 道到期错题") : nextDueText,
            enabled: due > 0
        ) {
            router.startMistakes(store: store)
        }
    }

    private var nextDueText: String {
        guard let next = store.state.mistakes.values.map(\.due).min() else { return String(localized: "暂无错题") }
        return String(localized: "下一道 \(next.formatted(.relative(presentation: .named))) 到期")
    }

    private var cardsCard: some View {
        let due = store.dueCards().count
        let all = store.library.course.cards.count
        let total = store.library.course.cards.filter(store.entitlements.isUnlockedCard).count
        let locked = all - total
        return PracticeCard(
            symbol: "mic.fill", color: Palette.purple, title: String(localized: "口述练习"),
            detail: locked > 0
                ? String(localized: "\(total) 道开放题来自各章自测与复盘。先合上书讲出来，再对照参考答案自评。已掌握 \(store.masteredCardCount)/\(total)，\(due) 张待练。完整版再解锁 \(locked) 张。")
                : String(localized: "\(total) 道开放题来自各章自测与复盘。先合上书讲出来，再对照参考答案自评。已掌握 \(store.masteredCardCount)/\(total)，\(due) 张待练。"),
            buttonTitle: String(localized: "开始口述"), enabled: due > 0
        ) {
            router.startCards(store.cardSession(), title: String(localized: "口述练习"))
        } footer: {
            NavigationLink {
                CardChapterScreen()
            } label: {
                Text("按章节选题")
                    .font(.rounded(15, .bold))
                    .foregroundStyle(Palette.purpleShadow)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
        }
    }

    private func practiceDetail(hearts: Bool) -> String {
        if store.learnedExercises.isEmpty {
            return String(localized: "学完一课后，就能从学过的题里随机抽 \(SessionBuilder.practiceSize) 道练习。")
        }
        let learned = store.learnedExercises.count
        return hearts
            ? String(localized: "从学过的 \(learned) 道题里抽 \(SessionBuilder.practiceSize) 道，错题优先。不扣红心，完成还能赚回 1 颗。")
            : String(localized: "从学过的 \(learned) 道题里抽 \(SessionBuilder.practiceSize) 道，错题优先。不扣红心。")
    }

    private var practiceCard: some View {
        let hearts = store.heartsEnabled && store.hearts < HeartState.maximum
        return PracticeCard(
            symbol: "dumbbell.fill", color: Palette.blue, title: String(localized: "随机练习"),
            detail: practiceDetail(hearts: hearts),
            buttonTitle: String(localized: "开始练习"), enabled: !store.practicePool.isEmpty
        ) {
            router.startPractice(store: store)
        }
    }
}

private struct PracticeCard<Footer: View>: View {
    let symbol: String
    let color: Color
    let title: String
    let detail: String
    let buttonTitle: String
    let enabled: Bool
    let action: () -> Void
    @ViewBuilder var footer: Footer

    init(symbol: String, color: Color, title: String, detail: String, buttonTitle: String, enabled: Bool,
         action: @escaping () -> Void, @ViewBuilder footer: () -> Footer = { EmptyView() }) {
        self.symbol = symbol
        self.color = color
        self.title = title
        self.detail = detail
        self.buttonTitle = buttonTitle
        self.enabled = enabled
        self.action = action
        self.footer = footer()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(RoundedRectangle(cornerRadius: 14).fill(color))
                Text(title)
                    .font(.rounded(21, .heavy))
                    .foregroundStyle(Palette.text)
            }
            Text(detail)
                .font(.rounded(15))
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            Button(buttonTitle, action: action)
                .buttonStyle(ChunkyButtonStyle(fill: color, shadow: color.opacity(0.7), height: 46))
                .disabled(!enabled)
            footer
        }
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Palette.card))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Palette.border, lineWidth: 2))
    }
}

/// 按章节浏览口述卡。
struct CardChapterScreen: View {
    @Environment(ProgressStore.self) private var store
    @Environment(Router.self) private var router

    var body: some View {
        List {
            ForEach(groups, id: \.chapter) { group in
                Section {
                    ForEach(group.cards) { card in
                        Button {
                            router.startCards([card], title: card.id)
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: icon(for: card))
                                    .foregroundStyle(color(for: card))
                                    .frame(width: 22)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(card.question)
                                        .font(.rounded(15, .semibold))
                                        .foregroundStyle(Palette.text)
                                    Text("\(card.id) · \(status(for: card))")
                                        .font(.rounded(12))
                                        .foregroundStyle(Palette.secondaryText)
                                }
                            }
                        }
                    }
                } header: {
                    HStack {
                        Text(group.title)
                        Spacer()
                        Button("练本章") {
                            let due = store.cardSession(chapter: group.chapter)
                            router.startCards(due.isEmpty ? group.cards : due, title: group.title)
                        }
                        .font(.rounded(13, .bold))
                    }
                }
            }
        }
        .navigationTitle("口述练习")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var groups: [(chapter: Int, title: String, cards: [Card])] {
        let chapters = Set(store.library.course.cards.map(\.chapter)).sorted { ($0 == 0 ? 99 : $0) < ($1 == 0 ? 99 : $1) }
        return chapters.map { number in
            let title = number == 0 ? String(localized: "通用复盘") : String(localized: "第 \(number) 章 · \(store.library.chapter(number)?.title ?? "")")
            return (number, title, store.library.cards(chapter: number))
        }
    }

    private func icon(for card: Card) -> String {
        guard store.entitlements.isUnlockedCard(card) else { return "lock.fill" }
        guard let memory = store.state.cards[card.id] else { return "circle" }
        return memory.isMastered ? "checkmark.circle.fill" : "circle.lefthalf.filled"
    }

    private func color(for card: Card) -> Color {
        guard store.entitlements.isUnlockedCard(card) else { return Palette.gold }
        guard let memory = store.state.cards[card.id] else { return Palette.lockedIcon }
        return memory.isMastered ? Palette.green : Palette.purple
    }

    private func status(for card: Card) -> String {
        guard store.entitlements.isUnlockedCard(card) else { return String(localized: "完整版") }
        guard let memory = store.state.cards[card.id] else { return String(localized: "未练过") }
        if memory.isDue(at: store.now) { return String(localized: "到期") }
        return memory.isMastered ? String(localized: "已掌握") : String(localized: "\(memory.due.formatted(.relative(presentation: .named)))复习")
    }
}

/// 错题本：按章列出，点开看答案和解析。
struct MistakeNotebookScreen: View {
    @Environment(ProgressStore.self) private var store
    @State private var detail: Exercise?

    var body: some View {
        List {
            if store.mistakeIDs.isEmpty {
                ContentUnavailableView("错题本是空的", systemImage: "checkmark.seal",
                                       description: Text("闯关和练习中答错的题会出现在这里。"))
                    .listRowBackground(Color.clear)
            }
            ForEach(groups, id: \.chapter) { group in
                Section("第 \(group.chapter) 章 · \(store.library.chapter(group.chapter)?.title ?? "")") {
                    ForEach(group.exercises) { exercise in
                        Button {
                            detail = exercise
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                RichText(exercise.prompt)
                                    .font(.rounded(15, .semibold))
                                    .foregroundStyle(Palette.text)
                                    .lineLimit(3)
                                    .multilineTextAlignment(.leading)
                                if let memory = store.state.mistakes[exercise.id] {
                                    HStack(spacing: 8) {
                                        Text(exercise.typeLabel)
                                        BoxMeter(box: memory.box)
                                        Text(memory.isDue(at: store.now) ? String(localized: "到期") : memory.due.formatted(.relative(presentation: .named)))
                                    }
                                    .font(.rounded(12))
                                    .foregroundStyle(Palette.secondaryText)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("错题本")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $detail) { exercise in
            ExerciseAnswerSheet(exercise: exercise)
                .presentationDetents([.medium, .large])
        }
    }

    private var groups: [(chapter: Int, exercises: [Exercise])] {
        let exercises = store.mistakeIDs.compactMap(store.library.exercise)
        return Dictionary(grouping: exercises, by: \.chapter).sorted { $0.key < $1.key }.map { ($0.key, $0.value) }
    }
}

private struct BoxMeter: View {
    let box: Int

    var body: some View {
        HStack(spacing: 2) {
            ForEach(1...MistakeMemory.lastBox, id: \.self) { i in
                Capsule()
                    .fill(i <= box ? Palette.green : Palette.locked)
                    .frame(width: 10, height: 5)
            }
        }
        .accessibilityLabel("熟练度 \(box)/\(MistakeMemory.lastBox)")
    }
}

/// 一道题的答案与解析。
struct ExerciseAnswerSheet: View {
    let exercise: Exercise
    @Environment(ProgressStore.self) private var store
    @State private var link: WebLink?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("\(exercise.typeLabel) · \(exercise.id)")
                    .font(.rounded(13, .bold))
                    .foregroundStyle(Palette.secondaryText)
                RichText(exercise.prompt)
                    .font(.rounded(19, .bold))
                    .foregroundStyle(Palette.text)
                VStack(alignment: .leading, spacing: 6) {
                    Text("正确答案").font(.rounded(14, .heavy))
                    RichText(Grader.correctAnswerText(exercise))
                        .font(.rounded(16, .semibold))
                }
                .foregroundStyle(Palette.correctText)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 14).fill(Palette.correctBackground))
                RichText(exercise.explanation)
                    .font(.rounded(16))
                    .foregroundStyle(Palette.text)
                    .lineSpacing(3)
                if let anchor = exercise.refAnchor {
                    Button {
                        link = WebLink(url: store.library.readerURL(anchor: anchor))
                    } label: {
                        Label("回看原文：\(exercise.refTitle ?? "")", systemImage: "book.fill")
                            .font(.rounded(15, .bold))
                            .multilineTextAlignment(.leading)
                    }
                }
            }
            .padding(20)
        }
        .screenBackground()
        .sheet(item: $link) { SafariView(url: $0.url).ignoresSafeArea() }
    }
}
