import SwiftUI

/// 口述卡：先自己讲，再看参考答案，按讲清楚的程度自评，决定下次什么时候再练。
struct CardSessionScreen: View {
    let cards: [Card]
    let title: String
    @Environment(ProgressStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var queue: [Card] = []
    @State private var position = 0
    @State private var revealed = false
    @State private var draft = ""
    @State private var reviewedIDs: Set<String> = []
    @State private var requeued: Set<String> = []
    @State private var celebration: Celebration?
    @State private var link: WebLink?

    var body: some View {
        VStack(spacing: 0) {
            if let celebration {
                CardResultView(count: reviewedIDs.count, celebration: celebration) { dismiss() }
            } else if position < queue.count {
                let card = queue[position]
                header
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        question(card)
                        if revealed {
                            answer(card)
                                .transition(.opacity.combined(with: .move(edge: .bottom)))
                        } else {
                            prompt
                        }
                    }
                    .padding(20)
                    .readableWidth()
                    .id(card.id + (revealed ? "-a" : "-q"))
                }
                .scrollDismissesKeyboard(.interactively)
                bottom(card)
            }
        }
        .screenBackground()
        .onAppear { if queue.isEmpty { queue = cards } }
        .sheet(item: $link) { SafariView(url: $0.url).ignoresSafeArea() }
    }

    private var header: some View {
        HStack(spacing: 14) {
            Button {
                finish()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(Palette.lockedIcon)
                    .frame(width: 32, height: 32)
            }
            .accessibilityLabel("结束")
            ProgressBar(value: Double(reviewedIDs.count) / Double(max(1, Set(cards.map(\.id)).count)), fill: Palette.purple)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func question(_ card: Card) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(card.id)
                Text(card.category)
                if card.chapter > 0 { Text("第 \(card.chapter) 章") }
            }
            .font(.rounded(13, .heavy))
            .foregroundStyle(Palette.purpleShadow)
            Text(card.question)
                .font(.rounded(23, .heavy))
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var prompt: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("合上书，出声讲 3～5 句", systemImage: "mic.fill")
                .font(.rounded(16, .bold))
                .foregroundStyle(Palette.text)
            Text("先说结论，再讲原因，举一个会出错的反例，最后说清方案在什么前提下成立。")
                .font(.rounded(15))
                .foregroundStyle(Palette.secondaryText)
            TextField("也可以在这里写几个关键词（可选）", text: $draft, axis: .vertical)
                .font(.rounded(16))
                .lineLimit(3...8)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12).fill(Palette.surface))
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16).strokeBorder(Palette.border, style: StrokeStyle(lineWidth: 2, dash: [6, 5])))
    }

    private func answer(_ card: Card) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if !draft.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("你的要点").font(.rounded(13, .heavy)).foregroundStyle(Palette.secondaryText)
                    Text(draft).font(.rounded(15)).foregroundStyle(Palette.text)
                }
            }
            if !card.conclusion.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("结论").font(.rounded(13, .heavy))
                    RichText(card.conclusion).font(.rounded(17, .bold))
                }
                .foregroundStyle(Palette.correctText)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 14).fill(Palette.correctBackground))
            }
            ForEach(Array(card.blocks.enumerated()), id: \.offset) { index, block in
                if index == 0, block.kind == .text, !card.conclusion.isEmpty, let text = block.text, text.hasPrefix("**") {
                    // 第一段的加粗结论已在上方单独展示，这里只显示其余部分
                    let rest = CardSessionScreen.dropLeadingBold(text)
                    if !rest.isEmpty {
                        CardBlockView(block: CardBlock(kind: .text, text: rest, image: nil, rows: nil))
                    }
                } else {
                    CardBlockView(block: block)
                }
            }
            Button {
                link = WebLink(url: store.library.readerURL(anchor: "d29/\(card.anchor)"))
            } label: {
                Label("在线查看完整解析", systemImage: "safari")
                    .font(.rounded(15, .bold))
            }
        }
    }

    static func dropLeadingBold(_ text: String) -> String {
        guard text.hasPrefix("**"), let end = text.range(of: "**", range: text.index(text.startIndex, offsetBy: 2)..<text.endIndex) else {
            return text
        }
        return String(text[end.upperBound...]).trimmingCharacters(in: .whitespaces)
    }

    @ViewBuilder
    private func bottom(_ card: Card) -> some View {
        VStack(spacing: 10) {
            if revealed {
                Text("讲得怎么样？")
                    .font(.rounded(14, .heavy))
                    .foregroundStyle(Palette.secondaryText)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(CardGrade.allCases, id: \.self) { grade in
                        Button(grade.label) { rate(card, grade) }
                            .buttonStyle(ChunkyButtonStyle(fill: color(grade).0, shadow: color(grade).1, height: 46))
                    }
                }
            } else {
                Button("显示参考答案") {
                    withAnimation(.easeOut(duration: 0.25)) { revealed = true }
                }
                .buttonStyle(ChunkyButtonStyle(fill: Palette.purple, shadow: Palette.purpleShadow))
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .readableWidth()
        .overlay(alignment: .top) { Divider().overlay(Palette.border) }
    }

    private func color(_ grade: CardGrade) -> (Color, Color) {
        switch grade {
        case .again: (Palette.red, Palette.redShadow)
        case .hard: (Palette.orange, Color(hex: 0xE08600))
        case .good: (Palette.green, Palette.greenShadow)
        case .easy: (Palette.blue, Palette.blueShadow)
        }
    }

    private func rate(_ card: Card, _ grade: CardGrade) {
        store.review(card, grade: grade)
        reviewedIDs.insert(card.id)
        if grade == .again, !requeued.contains(card.id) {
            requeued.insert(card.id)
            queue.append(card)
        }
        Haptics.tap()
        withAnimation(.easeInOut(duration: 0.2)) {
            revealed = false
            draft = ""
            position += 1
        }
        if position >= queue.count { finish() }
    }

    private func finish() {
        if reviewedIDs.isEmpty {
            dismiss()
        } else {
            celebration = store.finishCards(count: reviewedIDs.count)
        }
    }
}

struct CardBlockView: View {
    let block: CardBlock

    var body: some View {
        switch block.kind {
        case .text:
            RichText(block.text ?? "")
                .font(.rounded(16))
                .foregroundStyle(Palette.text)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        case .bullet:
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Circle().fill(Palette.secondaryText).frame(width: 5, height: 5).offset(y: -3)
                RichText(block.text ?? "")
                    .font(.rounded(16))
                    .foregroundStyle(Palette.text)
                    .lineSpacing(3)
            }
        case .image:
            if let name = block.image {
                VStack(alignment: .leading, spacing: 6) {
                    ContentImage(name: name)
                    if let caption = block.text, !caption.isEmpty {
                        Text(caption)
                            .font(.rounded(13))
                            .foregroundStyle(Palette.secondaryText)
                    }
                }
            }
        case .table:
            ScrollView(.horizontal) {
                Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                    ForEach(Array((block.rows ?? []).enumerated()), id: \.offset) { rowIndex, row in
                        GridRow {
                            ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
                                RichText(cell)
                                    .font(.rounded(13, rowIndex == 0 ? .bold : .regular))
                                    .foregroundStyle(Palette.text)
                                    .padding(8)
                                    .frame(minWidth: 90, maxWidth: 220, alignment: .leading)
                                    .background(rowIndex == 0 ? Palette.surface : Palette.card)
                                    .border(Palette.border, width: 0.5)
                            }
                        }
                    }
                }
            }
        }
    }
}

private struct CardResultView: View {
    let count: Int
    let celebration: Celebration
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "mic.circle.fill")
                .font(.system(size: 88, weight: .bold))
                .foregroundStyle(Palette.purple)
            Text("口述完成！")
                .font(.rounded(30, .heavy))
                .foregroundStyle(Palette.purpleShadow)
            Text("练了 \(count) 道题，获得 \(celebration.xp) XP。自评结果决定下次复习的时间：讲得越透，间隔越长。")
                .font(.rounded(16))
                .foregroundStyle(Palette.secondaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            if case let .extended(to) = celebration.streakEvent {
                Label("连胜 \(to) 天！", systemImage: "flame.fill")
                    .font(.rounded(17, .bold))
                    .foregroundStyle(Palette.orange)
            }
            Spacer()
            Button("继续", action: onContinue)
                .buttonStyle(ChunkyButtonStyle(fill: Palette.purple, shadow: Palette.purpleShadow))
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 8)
    }
}
