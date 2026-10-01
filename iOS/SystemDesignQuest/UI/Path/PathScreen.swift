import SwiftUI

/// 学习主页：按分段、单元排开的蜿蜒关卡路径。
struct PathScreen: View {
    @Environment(ProgressStore.self) private var store
    @Environment(Router.self) private var router
    @State private var selectedNode: String?
    @State private var guideChapter: Chapter?
    @State private var labChapter: Chapter?
    @State private var didInitialScroll = false
    /// 首次定位完成前先隐藏路径，避免看到从顶部跳到当前关卡。
    @State private var located = false
    /// 当前关卡是否在屏幕上；nil 表示还没渲染过。
    @State private var currentVisible: Bool?

    var body: some View {
        let states = store.nodeStates()
        let current = store.pathNodes.first { states[$0.id] == .current }
        VStack(spacing: 0) {
            StatsBar()
            Divider().overlay(Palette.border)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                        ForEach(Array(store.library.course.sections.enumerated()), id: \.element.id) { sectionIndex, section in
                            SectionBanner(index: sectionIndex, section: section)
                            ForEach(section.chapters, id: \.self) { number in
                                if let chapter = store.library.chapter(number) {
                                    unit(chapter, sectionIndex: sectionIndex, states: states)
                                        .id(number)
                                }
                            }
                        }
                        CourseFooter()
                    }
                    .readableWidth()
                    .padding(.bottom, 40)
                    // 点关卡之间的空白处收起介绍卡片
                    .background { Color.clear.contentShape(Rectangle()).onTapGesture { selectedNode = nil } }
                }
                .scrollIndicators(.hidden)
                .opacity(located || current == nil ? 1 : 0)
                .animation(.easeOut(duration: 0.2), value: located)
                // 不用 scrollPosition(id:) 绑定：它会在每次重绘时把视图拉回记录的单元，点关卡时整条路径跳动
                .onScrollPhaseChange { _, phase in
                    if phase == .interacting { selectedNode = nil }
                }
                .overlayPreferenceValue(SelectedNodeKey.self) { anchor in
                    GeometryReader { geo in
                        if let anchor, let id = selectedNode, let node = store.pathNodes.first(where: { $0.id == id }) {
                            nodeCard(node, state: states[node.id] ?? .locked, rect: geo[anchor], in: geo.size)
                        }
                    }
                }
                .onAppear {
                    guard !didInitialScroll, let current else { return }
                    didInitialScroll = true
                    locate(current, proxy: proxy)
                }
                .overlay(alignment: .bottomTrailing) {
                    if let current, currentVisible == false {
                        Button {
                            selectedNode = nil
                            locate(current, proxy: proxy)
                        } label: {
                            Image(systemName: "scope")
                                .font(.system(size: 18, weight: .bold))
                                .frame(width: 48, height: 44)
                        }
                        .buttonStyle(ChunkyButtonStyle(fill: Palette.card, shadow: Palette.border, foreground: Palette.blue, height: 44))
                        .frame(width: 52)
                        .padding(16)
                        .accessibilityLabel("回到当前关卡")
                    }
                }
            }
        }
        .screenBackground()
        .sheet(item: $guideChapter) { chapter in
            GuidebookSheet(chapter: chapter)
        }
        .sheet(item: $labChapter) { chapter in
            LabListSheet(chapter: chapter)
                .presentationDetents([.medium, .large])
        }
    }

    @ViewBuilder
    private func unit(_ chapter: Chapter, sectionIndex: Int, states: [String: NodeState]) -> some View {
        let colors = Palette.section(sectionIndex)
        let nodes = store.pathNodes.filter { $0.chapter == chapter.number }
        Section {
            VStack(spacing: 22) {
                ForEach(Array(nodes.enumerated()), id: \.element.id) { index, node in
                    PathNodeView(node: node, state: states[node.id] ?? .locked, colors: colors,
                                 isSelected: selectedNode == node.id,
                                 onTap: {
                                     withAnimation(.spring(duration: 0.25)) { selectedNode = selectedNode == node.id ? nil : node.id }
                                 })
                        .offset(x: zigzag(index, mirrored: chapter.number.isMultiple(of: 2)))
                        .anchorPreference(key: SelectedNodeKey.self, value: .bounds) { selectedNode == node.id ? $0 : nil }
                        .id(node.id)
                        .onScrollVisibilityChange(threshold: 0.3) { visible in
                            if states[node.id] == .current { currentVisible = visible }
                        }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 58)
            .padding(.bottom, 36)
            // 装饰图放在关卡摆向的另一侧
            .background(alignment: chapter.number.isMultiple(of: 2) ? .trailing : .leading) {
                Image(systemName: ChapterStyle.symbol(chapter.number))
                    .font(.system(size: 84, weight: .semibold))
                    .foregroundStyle(colors.0.opacity(0.13))
                    .padding(.horizontal, 36)
                    .accessibilityHidden(true)
            }
        } header: {
            UnitHeader(chapter: chapter, colors: colors, progress: store.unitProgress(chapter.number)) {
                guideChapter = chapter
            }
        }
    }

    /// 关卡介绍卡片：浮在路径上层，不改变布局也不滚动；下方放得下就放在关卡下方，否则放在上方，箭头指向关卡。
    private func nodeCard(_ node: PathNode, state: NodeState, rect: CGRect, in size: CGSize) -> some View {
        let below = size.height - rect.maxY >= min(rect.minY, 240)
        let width = min(size.width - 32, 340)
        let sectionIndex = store.library.course.sections.firstIndex { $0.chapters.contains(node.chapter) } ?? 0
        let chapter = store.library.chapter(node.chapter)
        // 锚点取的是布局位置，不含关卡左右摆动的 offset，这里补上
        let index = store.pathNodes.filter { $0.chapter == node.chapter }.firstIndex { $0.id == node.id } ?? 0
        let nodeX = rect.midX + zigzag(index, mirrored: node.chapter.isMultiple(of: 2))
        return NodeCard(node: node, state: state, colors: Palette.section(sectionIndex),
                        arrowX: min(max(nodeX - size.width / 2, -width / 2 + 28), width / 2 - 28),
                        arrowOnTop: below) {
            if let chapter { start(node, chapter: chapter) }
        }
        .frame(width: width)
        .frame(width: size.width, height: max(0, below ? size.height - rect.maxY - 14 : rect.minY - 14),
               alignment: below ? .top : .bottom)
        .offset(y: below ? rect.maxY + 14 : 0)
        .transition(.scale(scale: 0.9, anchor: below ? .top : .bottom).combined(with: .opacity))
    }

    /// 定位到当前关卡。懒加载列表只认得直接子项：先滚到所在单元让关卡加载出来，
    /// 之后只对准关卡本身（不再回到单元顶部，否则两步来回会让画面上下跳）。
    private func locate(_ node: PathNode, proxy: ScrollViewProxy) {
        Task { @MainActor in
            proxy.scrollTo(node.chapter, anchor: .top)
            for _ in 0..<6 {
                try? await Task.sleep(for: .milliseconds(120))
                proxy.scrollTo(node.id, anchor: .center)
            }
            located = true
        }
    }

    /// 关卡左右摆动的横向偏移，奇偶单元方向相反。
    private func zigzag(_ index: Int, mirrored: Bool) -> CGFloat {
        let x = sin(Double(index) * .pi / 4) * 72
        return mirrored ? -x : x
    }

    private func start(_ node: PathNode, chapter: Chapter) {
        selectedNode = nil
        switch node.kind {
        case let .lesson(lesson):
            router.startLesson(lesson, store: store)
        case let .labs(labs):
            if labs.count == 1 { router.openLab(labs[0]) } else { labChapter = chapter }
        case let .cards(cards):
            let due = store.cardSession(chapter: chapter.number)
            router.startCards(due.isEmpty ? cards : due, title: "第 \(chapter.number) 章口述练习")
        case .unitTest:
            router.startUnitTest(chapter: chapter, store: store)
        }
    }
}

struct SectionBanner: View {
    let index: Int
    let section: CourseSection

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 12) {
                Rectangle().fill(Palette.border).frame(height: 2)
                Text("第 \(index + 1) 部分")
                    .font(.rounded(13, .heavy))
                    .foregroundStyle(Palette.secondaryText)
                    .fixedSize()
                Rectangle().fill(Palette.border).frame(height: 2)
            }
            Text(section.title)
                .font(.rounded(22, .heavy))
                .foregroundStyle(Palette.text)
            Text(section.subtitle)
                .font(.rounded(14))
                .foregroundStyle(Palette.secondaryText)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 24)
        .padding(.top, 28)
        .padding(.bottom, 16)
    }
}

struct UnitHeader: View {
    let chapter: Chapter
    let colors: (Color, Color)
    let progress: (done: Int, total: Int)
    let onGuide: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 3) {
                Text("第 \(chapter.number) 单元 · \(progress.done)/\(progress.total)")
                    .font(.rounded(13, .heavy))
                    .opacity(0.85)
                Text(chapter.title)
                    .font(.rounded(19, .heavy))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 16)
            .padding(.vertical, 12)
            Rectangle().fill(colors.1).frame(width: 2).padding(.vertical, 2)
            Button(action: onGuide) {
                VStack(spacing: 2) {
                    Image(systemName: "book.closed.fill")
                        .font(.system(size: 20, weight: .bold))
                    Text("指南").font(.rounded(11, .heavy))
                }
                .frame(width: 64)
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("第 \(chapter.number) 单元指南")
        }
        .foregroundStyle(.white)
        .fixedSize(horizontal: false, vertical: true)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(colors.0))
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(colors.1).offset(y: 4))
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 4)
        .background(Palette.background)
    }
}

struct PathNodeView: View {
    let node: PathNode
    let state: NodeState
    let colors: (Color, Color)
    let isSelected: Bool
    let onTap: () -> Void
    @State private var bounce = false

    private var isTest: Bool { if case .unitTest = node.kind { true } else { false } }

    var body: some View {
        let (fill, shadow, iconColor) = palette
        Button {
            Haptics.tap()
            onTap()
        } label: {
            ZStack {
                if state == .current {
                    Circle()
                        .trim(from: 0, to: 1)
                        .stroke(Palette.locked, lineWidth: 8)
                        .frame(width: 96, height: 96)
                        .offset(y: 2)
                }
                Ellipse()
                    .fill(shadow)
                    .frame(width: 72, height: 64)
                    .offset(y: 7)
                Ellipse()
                    .fill(fill)
                    .frame(width: 72, height: 64)
                    .overlay(alignment: .top) {
                        Ellipse().fill(.white.opacity(state == .locked ? 0.07 : 0.18)).frame(width: 44, height: 16).offset(y: 7)
                    }
                Image(systemName: icon)
                    .font(.system(size: 28, weight: .heavy))
                    .foregroundStyle(iconColor)
            }
            .frame(width: 100, height: 100)
            .contentShape(Circle())
        }
        .buttonStyle(NodePressStyle())
        .overlay(alignment: .top) {
            if state == .current && !isSelected {
                StartBubble(color: colors.0)
                    .offset(y: bounce ? -40 : -34)
                    .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: bounce)
                    .onAppear { bounce = true }
                    .allowsHitTesting(false)
            }
        }
        .accessibilityLabel("\(node.title)，\(stateLabel)")
    }

    private var icon: String {
        switch state {
        case .locked: node.isRequired ? (isTest ? "trophy.fill" : "lock.fill") : node.symbol
        case .completed: isTest ? "trophy.fill" : (node.isRequired ? "checkmark" : node.symbol)
        default: node.symbol
        }
    }

    private var palette: (Color, Color, Color) {
        switch state {
        case .locked: (Palette.locked, Palette.lockedShadow, Palette.lockedIcon)
        case .completed where isTest: (Palette.gold, Palette.goldShadow, .white)
        default: (colors.0, colors.1, .white)
        }
    }

    private var stateLabel: String {
        switch state {
        case .locked: "未解锁"
        case .available: "可以开始"
        case .current: "当前关卡"
        case .completed: "已完成"
        }
    }
}

private struct NodePressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .offset(y: configuration.isPressed ? 5 : 0)
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }
}

private struct StartBubble: View {
    let color: Color

    var body: some View {
        Text("开始")
            .font(.rounded(15, .heavy))
            .foregroundStyle(color)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 12).fill(Palette.card))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.border, lineWidth: 2))
            .overlay(alignment: .bottom) {
                Image(systemName: "arrowtriangle.down.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.card)
                    .offset(y: 9)
            }
            .fixedSize()
    }
}

/// 选中关卡的位置，交给路径上层画介绍卡片。
private struct SelectedNodeKey: PreferenceKey {
    static let defaultValue: Anchor<CGRect>? = nil
    static func reduce(value: inout Anchor<CGRect>?, nextValue: () -> Anchor<CGRect>?) {
        value = value ?? nextValue()
    }
}

private struct NodeCard: View {
    let node: PathNode
    let state: NodeState
    let colors: (Color, Color)
    /// 箭头相对卡片中线的横向偏移。
    let arrowX: CGFloat
    let arrowOnTop: Bool
    let onStart: () -> Void

    var body: some View {
        let fill = state == .locked ? Palette.surface : colors.0
        VStack(alignment: .leading, spacing: 10) {
            Text(node.title)
                .font(.rounded(19, .heavy))
            Text(node.subtitle)
                .font(.rounded(15))
                .fixedSize(horizontal: false, vertical: true)
                .opacity(0.9)
            if state == .locked {
                Label("先完成前面的关卡；也可以在「我的 → 设置」里打开自由模式", systemImage: "lock.fill")
                    .font(.rounded(13, .semibold))
                    .opacity(0.85)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Button(action: onStart) {
                    Text(buttonTitle)
                }
                .buttonStyle(ChunkyButtonStyle(fill: .white, shadow: Color.black.opacity(0.18), foreground: colors.1, height: 46))
                .padding(.top, 4)
            }
        }
        .foregroundStyle(state == .locked ? Palette.secondaryText : .white)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(fill))
        .overlay(alignment: arrowOnTop ? .top : .bottom) {
            CardArrow(pointsUp: arrowOnTop)
                .fill(fill)
                .frame(width: 24, height: 12)
                .offset(x: arrowX, y: arrowOnTop ? -11 : 11)
        }
        .overlay {
            if state == .locked {
                RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.border, lineWidth: 1.5)
            }
        }
        .shadow(color: .black.opacity(0.14), radius: 14, y: 6)
        .accessibilityElement(children: .contain)
    }

    private var buttonTitle: String {
        switch node.kind {
        case .lesson: state == .completed ? "再练一次 +\(XPRules.lesson) XP" : "开始 +\(XPRules.lesson) XP"
        case .labs: "打开实验"
        case .cards: "开始口述"
        case .unitTest: state == .completed ? "再测一次 +\(XPRules.unitTest) XP" : "开始测验 +\(XPRules.unitTest) XP"
        }
    }
}

private struct CardArrow: Shape {
    let pointsUp: Bool

    func path(in rect: CGRect) -> Path {
        var path = Path()
        if pointsUp {
            path.move(to: CGPoint(x: rect.midX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        } else {
            path.move(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        }
        path.closeSubpath()
        return path
    }
}

private struct CourseFooter: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "flag.checkered")
                .font(.system(size: 36, weight: .bold))
                .foregroundStyle(Palette.lockedIcon)
            Text("题目依据《系统设计面试笔记：中文学习版》编写")
                .font(.rounded(13))
                .foregroundStyle(Palette.secondaryText)
        }
        .padding(.top, 20)
    }
}

enum ChapterStyle {
    static func symbol(_ chapter: Int) -> String {
        let symbols = [
            1: "server.rack", 2: "function", 3: "person.2.wave.2.fill", 4: "gauge.with.dots.needle.67percent",
            5: "circle.dashed", 6: "cylinder.split.1x2.fill", 7: "number", 8: "link", 9: "ant.fill",
            10: "bell.badge.fill", 11: "list.bullet.rectangle.fill", 12: "bubble.left.and.bubble.right.fill",
            13: "magnifyingglass", 14: "play.rectangle.fill", 15: "folder.fill", 16: "mappin.and.ellipse",
            17: "location.circle.fill", 18: "map.fill", 19: "tray.full.fill", 20: "waveform.path.ecg",
            21: "cursorarrow.click.2", 22: "bed.double.fill", 23: "envelope.fill", 24: "archivebox.fill",
            25: "list.number", 26: "creditcard.fill", 27: "wallet.pass.fill", 28: "chart.line.uptrend.xyaxis",
        ]
        return symbols[chapter] ?? "square.grid.2x2.fill"
    }
}
