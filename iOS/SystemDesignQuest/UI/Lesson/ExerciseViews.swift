import SwiftUI

/// 按题型分派的答题区域。
struct ExerciseContent: View {
    let item: LessonSession.Item
    @Binding var draft: AnswerDraft
    let phase: LessonSession.Phase
    let onMatchComplete: (Int) -> Void

    private var locked: Bool { phase != .answering }
    private var feedback: Bool? { if case let .feedback(correct) = phase { correct } else { nil } }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 8) {
                if item.isRetry {
                    Label("再试一次", systemImage: "arrow.counterclockwise")
                        .font(.rounded(13, .heavy))
                        .foregroundStyle(Palette.orange)
                } else {
                    Text(item.exercise.instruction)
                        .font(.rounded(13, .heavy))
                        .foregroundStyle(Palette.purpleShadow)
                }
                Spacer()
                Text(item.exercise.typeLabel)
                    .font(.rounded(12, .bold))
                    .foregroundStyle(Palette.secondaryText)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Palette.surface))
            }
            if case .judge = item.exercise.kind {
                StatementCard(text: item.exercise.prompt)
            } else {
                RichText(item.exercise.prompt)
                    .font(.rounded(21, .bold))
                    .foregroundStyle(Palette.text)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            switch item.exercise.kind {
            case let .single(options, answer):
                ChoiceList(options: options, order: item.presentation.optionOrder, multiple: false,
                           selected: draft.single.map { [$0] } ?? [], correct: [answer], feedback: feedback, locked: locked) { index in
                    draft.single = index
                }
            case let .multi(options, answers):
                ChoiceList(options: options, order: item.presentation.optionOrder, multiple: true,
                           selected: draft.multi, correct: answers, feedback: feedback, locked: locked) { index in
                    if draft.multi.contains(index) { draft.multi.remove(index) } else { draft.multi.insert(index) }
                }
            case let .judge(answer):
                JudgeButtons(selected: draft.judge, answer: answer, feedback: feedback, locked: locked) { draft.judge = $0 }
            case let .fill(segments, answers, _):
                FillBlankView(segments: segments, blankCount: answers.count, chips: item.presentation.chips,
                              filled: $draft.fill, feedback: feedback, locked: locked)
            case .order:
                OrderView(items: item.presentation.shuffledItems, chosen: $draft.order, feedback: feedback, locked: locked)
            case let .match(pairs):
                MatchView(pairs: pairs, leftOrder: item.presentation.leftOrder, rightOrder: item.presentation.rightOrder,
                          locked: locked, onComplete: onMatchComplete)
            }
        }
    }
}

private struct StatementCard: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "quote.opening")
                .font(.system(size: 22, weight: .black))
                .foregroundStyle(Palette.blue)
            RichText(text)
                .font(.rounded(19, .semibold))
                .foregroundStyle(Palette.text)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Palette.card))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.border, lineWidth: 2))
    }
}

// MARK: - 单选 / 多选

private struct ChoiceList: View {
    let options: [String]
    let order: [Int]
    let multiple: Bool
    let selected: Set<Int>
    let correct: Set<Int>
    let feedback: Bool?
    let locked: Bool
    let onSelect: (Int) -> Void

    var body: some View {
        VStack(spacing: 12) {
            ForEach(Array(order.enumerated()), id: \.element) { position, index in
                Button {
                    Haptics.tap()
                    onSelect(index)
                } label: {
                    HStack(spacing: 12) {
                        badge(position: position, index: index)
                        RichText(options[index])
                            .font(.rounded(17, .semibold))
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 14)
                    .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(OutlineCardStyle(state: state(for: index)))
                .disabled(locked)
            }
        }
    }

    @ViewBuilder
    private func badge(position: Int, index: Int) -> some View {
        if multiple {
            Image(systemName: selected.contains(index) ? "checkmark.square.fill" : "square")
                .font(.system(size: 22, weight: .semibold))
        } else {
            Text("\(position + 1)")
                .font(.rounded(14, .bold))
                .frame(width: 28, height: 28)
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.border, lineWidth: 2))
        }
    }

    private func state(for index: Int) -> OutlineCardStyle.State {
        guard feedback != nil else { return selected.contains(index) ? .selected : .normal }
        if correct.contains(index) { return .correct }
        if selected.contains(index) { return .wrong }
        return .disabled
    }
}

// MARK: - 判断

private struct JudgeButtons: View {
    let selected: Bool?
    let answer: Bool
    let feedback: Bool?
    let locked: Bool
    let onSelect: (Bool) -> Void

    var body: some View {
        HStack(spacing: 14) {
            option(true, title: "正确", symbol: "checkmark")
            option(false, title: "错误", symbol: "xmark")
        }
    }

    private func option(_ value: Bool, title: LocalizedStringKey, symbol: String) -> some View {
        Button {
            Haptics.tap()
            onSelect(value)
        } label: {
            VStack(spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 30, weight: .heavy))
                Text(title).font(.rounded(18, .bold))
            }
            .frame(maxWidth: .infinity, minHeight: 110)
            .contentShape(Rectangle())
        }
        .buttonStyle(OutlineCardStyle(state: state(value), cornerRadius: 18))
        .disabled(locked)
    }

    private func state(_ value: Bool) -> OutlineCardStyle.State {
        guard feedback != nil else { return selected == value ? .selected : .normal }
        if value == answer { return .correct }
        return selected == value ? .wrong : .disabled
    }
}

// MARK: - 选词填空

private struct FillBlankView: View {
    let segments: [FillSegment]
    let blankCount: Int
    let chips: [String]
    @Binding var filled: [Int?]
    let feedback: Bool?
    let locked: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            FlowLayout(spacing: 0, lineSpacing: 10) {
                ForEach(Array(tokens.enumerated()), id: \.offset) { _, token in
                    switch token {
                    case let .text(text):
                        Text(text)
                            .font(.rounded(19, .medium))
                            .foregroundStyle(Palette.text)
                            .frame(minHeight: 40)
                    case let .blank(index):
                        slot(index)
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Palette.surface))

            FlowLayout(spacing: 10, lineSpacing: 12, alignment: .center) {
                ForEach(Array(chips.enumerated()), id: \.offset) { index, chip in
                    let used = filled.contains(index)
                    Button {
                        Haptics.tap()
                        place(index)
                    } label: {
                        Text(chip)
                            .font(.rounded(17, .semibold))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .opacity(used ? 0 : 1)
                    }
                    .buttonStyle(OutlineCardStyle(state: used ? .disabled : .normal, cornerRadius: 12))
                    .disabled(used || locked)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .onAppear {
            if filled.count != blankCount { filled = Array(repeating: nil, count: blankCount) }
        }
    }

    private func slot(_ index: Int) -> some View {
        let chip = index < filled.count ? filled[index] : nil
        let active = !locked && chip == nil && filled.firstIndex(where: { $0 == nil }) == index
        let color: Color = feedback == nil ? (active ? Palette.blue : Palette.border) : (feedback! ? Palette.green : Palette.red)
        return Button {
            guard !locked, index < filled.count else { return }
            Haptics.tap()
            filled[index] = nil
        } label: {
            Text(chip.map { chips[$0] } ?? " ")
                .font(.rounded(17, .bold))
                .foregroundStyle(feedback == nil ? Palette.blueShadow : (feedback! ? Palette.correctText : Palette.wrongText))
                .padding(.horizontal, 10)
                .frame(minWidth: 64, minHeight: 36)
                .background(RoundedRectangle(cornerRadius: 10).fill(chip == nil ? Color.clear : Palette.card))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(color, style: StrokeStyle(lineWidth: 2, dash: chip == nil ? [5, 4] : [])))
                .padding(.horizontal, 3)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(chip.map { "第 \(index + 1) 空：\(chips[$0])" } ?? "第 \(index + 1) 空，未填")
    }

    private func place(_ chip: Int) {
        guard let slot = filled.firstIndex(where: { $0 == nil }) else { return }
        filled[slot] = chip
    }

    private enum Token { case text(String), blank(Int) }

    /// 中文逐字、英文按词拆开，保证句子能在任意位置换行；标点粘在前一个字后面。
    private var tokens: [Token] {
        var result: [Token] = []
        for segment in segments {
            switch segment {
            case let .blank(index):
                result.append(.blank(index))
            case let .text(raw):
                var word = ""
                func flush() {
                    if !word.isEmpty { result.append(.text(word)); word = "" }
                }
                for ch in RichText.plain(raw) {
                    if ch.isASCII && (ch.isLetter || ch.isNumber || "._^%/+-=<>:'#$()[]".contains(ch)) {
                        word.append(ch)
                    } else if "，。、；：？！）」』”’,.;:?!)".contains(ch) {
                        if !word.isEmpty {
                            word.append(ch)
                            flush()
                        } else if case let .text(last)? = result.last {
                            result[result.count - 1] = .text(last + String(ch))
                        } else {
                            result.append(.text(String(ch)))
                        }
                    } else {
                        flush()
                        word = String(ch)
                        if ch.isWhitespace { word = " " }
                        flush()
                    }
                }
                flush()
            }
        }
        return result
    }
}

// MARK: - 排序

private struct OrderView: View {
    let items: [String]
    @Binding var chosen: [Int]
    let feedback: Bool?
    let locked: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(spacing: 10) {
                ForEach(Array(chosen.enumerated()), id: \.element) { position, index in
                    Button {
                        Haptics.tap()
                        chosen.removeAll { $0 == index }
                    } label: {
                        row(number: position + 1, text: items[index])
                    }
                    .buttonStyle(OutlineCardStyle(state: feedback == nil ? .selected : (feedback! ? .correct : .wrong)))
                    .disabled(locked)
                }
                if chosen.count < items.count {
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(Palette.border, style: StrokeStyle(lineWidth: 2, dash: [6, 5]))
                        .frame(height: 52)
                        .overlay(alignment: .leading) {
                            Text("第 \(chosen.count + 1) 步：点下方选项放进来")
                                .font(.rounded(15, .semibold))
                                .foregroundStyle(Palette.lockedIcon)
                                .padding(.leading, 18)
                        }
                }
            }
            if chosen.count < items.count {
                Divider().overlay(Palette.border)
                VStack(spacing: 10) {
                    ForEach(items.indices.filter { !chosen.contains($0) }, id: \.self) { index in
                        Button {
                            Haptics.tap()
                            chosen.append(index)
                        } label: {
                            row(number: nil, text: items[index])
                        }
                        .buttonStyle(OutlineCardStyle())
                        .disabled(locked)
                    }
                }
            }
        }
    }

    private func row(number: Int?, text: String) -> some View {
        HStack(spacing: 12) {
            if let number {
                Text("\(number)")
                    .font(.rounded(15, .heavy))
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(Palette.card))
            }
            RichText(text)
                .font(.rounded(16, .semibold))
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .contentShape(Rectangle())
    }
}

// MARK: - 配对

private struct MatchView: View {
    let pairs: [MatchPair]
    let leftOrder: [Int]
    let rightOrder: [Int]
    let locked: Bool
    let onComplete: (Int) -> Void

    @State private var matched: Set<Int> = []
    @State private var selectedLeft: Int?
    @State private var selectedRight: Int?
    @State private var wrong: (left: Int, right: Int)?
    @State private var justMatched: Int?
    @State private var mistakes = 0

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            column(order: leftOrder, isLeft: true)
            column(order: rightOrder, isLeft: false)
        }
    }

    private func column(order: [Int], isLeft: Bool) -> some View {
        VStack(spacing: 12) {
            ForEach(order, id: \.self) { index in
                let text = isLeft ? pairs[index].left : pairs[index].right
                Button {
                    tap(index, isLeft: isLeft)
                } label: {
                    RichText(text)
                        .font(.rounded(isLeft ? 16 : 14, .semibold))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, minHeight: 68)
                        .contentShape(Rectangle())
                }
                .buttonStyle(OutlineCardStyle(state: state(index, isLeft: isLeft)))
                .disabled(locked || matched.contains(index))
                .modifier(Shake(animatableData: wrongFor(index, isLeft: isLeft) ? 1 : 0))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func wrongFor(_ index: Int, isLeft: Bool) -> Bool {
        guard let wrong else { return false }
        return isLeft ? wrong.left == index : wrong.right == index
    }

    private func state(_ index: Int, isLeft: Bool) -> OutlineCardStyle.State {
        if justMatched == index { return .correct }
        if matched.contains(index) { return .disabled }
        if wrongFor(index, isLeft: isLeft) { return .wrong }
        return (isLeft ? selectedLeft : selectedRight) == index ? .selected : .normal
    }

    private func tap(_ index: Int, isLeft: Bool) {
        Haptics.tap()
        wrong = nil
        if isLeft { selectedLeft = selectedLeft == index ? nil : index } else { selectedRight = selectedRight == index ? nil : index }
        guard let left = selectedLeft, let right = selectedRight else { return }
        selectedLeft = nil
        selectedRight = nil
        if left == right {
            justMatched = left
            withAnimation(.easeOut(duration: 0.25).delay(0.25)) {
                _ = matched.insert(left)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                if justMatched == left { justMatched = nil }
                if matched.count == pairs.count { onComplete(mistakes) }
            }
        } else {
            mistakes += 1
            Haptics.error()
            withAnimation(.default) { wrong = (left, right) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
                if wrong?.left == left && wrong?.right == right {
                    withAnimation { wrong = nil }
                }
            }
        }
    }
}

/// 配错时左右抖动。
private struct Shake: GeometryEffect {
    var animatableData: CGFloat

    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 8 * sin(animatableData * .pi * 4), y: 0))
    }
}
