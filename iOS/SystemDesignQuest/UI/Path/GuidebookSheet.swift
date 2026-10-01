import SwiftUI

/// 单元指南：导读、本章要点、交互实验和在线全文。
struct GuidebookSheet: View {
    let chapter: Chapter
    @Environment(ProgressStore.self) private var store
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var link: WebLink?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("第 \(chapter.number) 单元指南")
                            .font(.rounded(14, .heavy))
                            .foregroundStyle(Palette.secondaryText)
                        Text(chapter.fullTitle)
                            .font(.rounded(24, .heavy))
                            .foregroundStyle(Palette.text)
                    }
                    if let image = chapter.introImage {
                        ContentImage(name: image)
                    }
                    if !chapter.intro.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(chapter.intro, id: \.self) { paragraph in
                                RichText(paragraph)
                                    .font(.rounded(16))
                                    .foregroundStyle(Palette.text)
                                    .lineSpacing(4)
                            }
                        }
                    }
                    if !chapter.keyPoints.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("本章要点")
                                .font(.rounded(19, .heavy))
                                .foregroundStyle(Palette.text)
                            ForEach(Array(chapter.keyPoints.enumerated()), id: \.offset) { index, point in
                                HStack(alignment: .firstTextBaseline, spacing: 10) {
                                    Text("\(index + 1)")
                                        .font(.rounded(14, .heavy))
                                        .foregroundStyle(.white)
                                        .frame(width: 24, height: 24)
                                        .background(Circle().fill(Palette.green))
                                    RichText(point)
                                        .font(.rounded(16))
                                        .foregroundStyle(Palette.text)
                                        .lineSpacing(3)
                                }
                            }
                        }
                        .padding(16)
                        .background(RoundedRectangle(cornerRadius: 16).fill(Palette.surface))
                    }
                    if !chapter.labs.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("交互实验")
                                .font(.rounded(19, .heavy))
                                .foregroundStyle(Palette.text)
                            ForEach(chapter.labs) { lab in
                                LabRow(lab: lab, done: store.isLabCompleted(lab)) {
                                    dismiss()
                                    router.openLab(lab)
                                }
                            }
                        }
                    }
                    VideoEntryButton(chapter: chapter.number)
                    Button {
                        link = WebLink(url: store.library.readerURL(anchor: chapter.docID))
                    } label: {
                        Label("阅读本章全文（在线）", systemImage: "safari.fill")
                    }
                    .buttonStyle(ChunkyButtonStyle(fill: Palette.blue, shadow: Palette.blueShadow))
                }
                .padding(20)
                .readableWidth()
            }
            .screenBackground()
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") { dismiss() }.font(.rounded(17, .bold))
                }
            }
        }
        .sheet(item: $link) { SafariView(url: $0.url).ignoresSafeArea() }
    }
}

struct LabRow: View {
    let lab: Lab
    let done: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: done ? "checkmark.circle.fill" : "flask.fill")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(done ? Palette.green : Palette.purple)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 4) {
                    Text(lab.title)
                        .font(.rounded(16, .bold))
                        .foregroundStyle(Palette.text)
                        .multilineTextAlignment(.leading)
                    Text(lab.summary)
                        .font(.rounded(13))
                        .foregroundStyle(Palette.secondaryText)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Palette.lockedIcon)
                    .padding(.top, 4)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(OutlineCardStyle())
    }
}

struct LabListSheet: View {
    let chapter: Chapter
    @Environment(ProgressStore.self) private var store
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    Text("先读题预测结果，再运行场景对照。完成一个实验即可点亮这一关。")
                        .font(.rounded(15))
                        .foregroundStyle(Palette.secondaryText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    ForEach(chapter.labs) { lab in
                        LabRow(lab: lab, done: store.isLabCompleted(lab)) {
                            dismiss()
                            router.openLab(lab)
                        }
                    }
                }
                .padding(20)
            }
            .screenBackground()
            .navigationTitle("第 \(chapter.number) 章实验")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("关闭") { dismiss() }
                }
            }
        }
    }
}
