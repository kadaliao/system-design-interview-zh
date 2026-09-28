import SwiftUI
import WebKit

/// 离线运行阅读页里的交互实验（内容包 Content/Labs）。
struct LabScreen: View {
    let lab: Lab
    @Environment(ProgressStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var celebration: Celebration?

    var body: some View {
        NavigationStack {
            // 网页视图延伸到屏幕底边：实验的播放控制条固定在底部，手机上不用滚到最后才能点「下一步」
            LabWebView(file: lab.file, labID: lab.id, dark: colorScheme == .dark)
                .id(colorScheme)
                .ignoresSafeArea(edges: .bottom)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark").font(.system(size: 16, weight: .bold))
                        }
                        .accessibilityLabel("关闭")
                    }
                    ToolbarItem(placement: .principal) {
                        Text(lab.title)
                            .font(.rounded(15, .bold))
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                            .minimumScaleFactor(0.85)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        completeButton
                    }
                }
                .overlay(alignment: .top) {
                    if let celebration {
                        Label("实验完成，获得 \(celebration.xp) XP", systemImage: "checkmark.circle.fill")
                            .font(.rounded(15, .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(Capsule().fill(Palette.green))
                            .padding(.top, 8)
                            .transition(.move(edge: .top).combined(with: .opacity))
                            .task {
                                try? await Task.sleep(for: .seconds(2.5))
                                withAnimation { self.celebration = nil }
                            }
                    }
                }
        }
    }

    @ViewBuilder
    private var completeButton: some View {
        if store.isLabCompleted(lab) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Palette.green)
                .accessibilityLabel("实验已完成")
        } else {
            Button {
                withAnimation { celebration = store.completeLab(lab) }
                Haptics.success()
            } label: {
                Text("做完了").font(.rounded(15, .heavy)).foregroundStyle(.white)
            }
            .buttonStyle(.borderedProminent)
            .tint(Palette.green)
            .accessibilityLabel("我做完了，获得 \(XPRules.lab) XP")
        }
    }
}

struct LabWebView: UIViewRepresentable {
    let file: String
    let labID: String
    let dark: Bool

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let settings: [String: String] = ["file": file, "lab": labID, "theme": dark ? "dark" : "light"]
        let json = (try? JSONSerialization.data(withJSONObject: settings)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        config.userContentController.addUserScript(
            WKUserScript(source: "window.SDQ_CONFIG=\(json);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = dark ? UIColor(red: 0.07, green: 0.09, blue: 0.08, alpha: 1) : UIColor(red: 0.99, green: 0.98, blue: 0.96, alpha: 1)
        if let dir = Bundle.main.url(forResource: "Labs", withExtension: nil, subdirectory: CourseLibrary.contentDirectory) {
            webView.loadFileURL(dir.appending(path: "lab.html"), allowingReadAccessTo: dir)
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
            // 实验里的外链（在线阅读版、参考资料）交给 Safari 打开
            if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}
