import SafariServices
import SwiftUI

/// 渲染题库里允许的行内标记：`**粗体**`、`` `代码` ``（答案卡里还有链接）。
struct RichText: View {
    let markdown: String

    init(_ markdown: String) { self.markdown = markdown }

    var body: some View {
        Text(RichText.attributed(markdown))
    }

    static func attributed(_ markdown: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: markdown, options: options)) ?? AttributedString(markdown)
    }

    /// 去掉标记的纯文本，用于词块、配对等短文本。
    static func plain(_ markdown: String) -> String {
        String(attributed(markdown).characters)
    }
}

/// 自动换行的流式布局，放词块、填空句子等。
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8
    var alignment: HorizontalAlignment = .leading

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(proposal: proposal, subviews: subviews)
        let width = proposal.width ?? rows.map(\.width).max() ?? 0
        let height = rows.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(proposal: ProposedViewSize(width: bounds.width, height: nil), subviews: subviews) {
            var x = bounds.minX
            if alignment == .center { x += (bounds.width - row.width) / 2 }
            for (index, size) in zip(row.indices, row.sizes) {
                subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2),
                                      proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + lineSpacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var sizes: [CGSize] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> [Row] {
        let maxWidth = proposal.width ?? .infinity
        var rows: [Row] = [Row()]
        for (index, subview) in subviews.enumerated() {
            var size = subview.sizeThatFits(ProposedViewSize(width: maxWidth, height: nil))
            size.width = min(size.width, maxWidth)
            if !rows[rows.count - 1].indices.isEmpty, rows[rows.count - 1].width + spacing + size.width > maxWidth {
                rows.append(Row())
            }
            var row = rows.removeLast()
            row.width += (row.indices.isEmpty ? 0 : spacing) + size.width
            row.height = max(row.height, size.height)
            row.indices.append(index)
            row.sizes.append(size)
            rows.append(row)
        }
        return rows.filter { !$0.indices.isEmpty }
    }
}

struct ProgressBar: View {
    var value: Double
    var fill: Color = Palette.green
    var height: CGFloat = 16

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.locked)
                Capsule()
                    .fill(fill)
                    .frame(width: max(value > 0 ? height : 0, geo.size.width * min(1, max(0, value))))
                    .overlay(alignment: .top) {
                        Capsule()
                            .fill(.white.opacity(0.3))
                            .frame(height: height * 0.28)
                            .padding(.horizontal, height * 0.5)
                            .padding(.top, height * 0.2)
                    }
            }
        }
        .frame(height: height)
        .animation(.spring(response: 0.45, dampingFraction: 0.75), value: value)
    }
}

/// 顶栏的小统计：火焰、红心、XP。
struct StatPill: View {
    let symbol: String
    let value: String
    let color: Color

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(color)
            Text(value)
                .font(.rounded(17, .heavy))
                .foregroundStyle(color)
                .monospacedDigit()
        }
    }
}

struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.preferredControlTintColor = UIColor(Palette.greenShadow)
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

/// 顶部短暂出现的绿色提示条。
struct ToastBanner: View {
    let text: String

    var body: some View {
        Label(text, systemImage: "checkmark.circle.fill")
            .font(.rounded(15, .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Capsule().fill(Palette.green))
            .padding(.top, 8)
            .onAppear { UIAccessibility.post(notification: .announcement, argument: text) }
    }
}

/// 用于 `.sheet(item:)` 的 URL 包装。
struct WebLink: Identifiable, Hashable {
    let url: URL
    var id: String { url.absoluteString }
}

/// 读取内容包里的图片（PNG），点按后全屏查看、可缩放。
struct ContentImage: View {
    let name: String
    @State private var zoomed = false

    var body: some View {
        if let url = CourseLibrary.imageURL(name), let image = UIImage(contentsOfFile: url.path(percentEncoded: false)) {
            Button {
                zoomed = true
            } label: {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
                    .overlay(alignment: .bottomTrailing) {
                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 26, height: 26)
                            .background(Circle().fill(.black.opacity(0.4)))
                            .padding(8)
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("图片")
            .accessibilityHint("全屏查看，可缩放")
            .fullScreenCover(isPresented: $zoomed) {
                ImageViewer(image: image)
            }
        }
    }
}

extension View {
    /// iPad 等宽屏上限制内容宽度并居中，手机上不受影响。
    func readableWidth(_ maxWidth: CGFloat = 680) -> some View {
        frame(maxWidth: maxWidth).frame(maxWidth: .infinity)
    }

    /// 页面级的背景色。
    func screenBackground() -> some View {
        background(Palette.background.ignoresSafeArea())
    }
}
