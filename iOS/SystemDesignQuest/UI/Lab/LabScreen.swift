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
            LabWebView(file: lab.file, labID: lab.id, dark: colorScheme == .dark)
                .id(colorScheme)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle(lab.title)
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
                }
                .safeAreaInset(edge: .bottom) {
                    bottomBar
                }
        }
    }

    private var bottomBar: some View {
        VStack(spacing: 8) {
            if let celebration {
                Label("实验完成，获得 \(celebration.xp) XP", systemImage: "checkmark.circle.fill")
                    .font(.rounded(15, .bold))
                    .foregroundStyle(Palette.correctText)
            }
            if store.isLabCompleted(lab) {
                Button("返回") { dismiss() }
                    .buttonStyle(ChunkyButtonStyle(fill: Palette.card, shadow: Palette.border, foreground: Palette.blue, height: 46))
            } else {
                Button("我做完了 +\(XPRules.lab) XP") {
                    celebration = store.completeLab(lab)
                    Haptics.success()
                }
                .buttonStyle(ChunkyButtonStyle(height: 46))
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 4)
        .background(.bar)
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
