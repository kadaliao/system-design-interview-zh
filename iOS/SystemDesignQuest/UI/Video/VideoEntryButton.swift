import SwiftUI

/// 单元指南里的「观看动画讲解」按钮，自带播放页和锁定提示。
struct VideoEntryButton: View {
    let chapter: Int
    @State private var playing = false
    @State private var showsLockedAlert = false
    private let service = VideoService.shared

    var body: some View {
        if let asset = service.asset(chapter: chapter) {
            let locked = !service.access.canPlay(chapter: chapter)
            Button {
                if service.requestPlayback(chapter: chapter) {
                    playing = true
                } else if service.onNeedsPaywall == nil {
                    showsLockedAlert = true
                }
            } label: {
                Label("观看动画讲解（\(VideoFormat.duration(asset.info.durationSec))）",
                      systemImage: locked ? "lock.fill" : "play.rectangle.fill")
            }
            .buttonStyle(ChunkyButtonStyle(fill: Palette.purple, shadow: Palette.purpleShadow))
            .fullScreenCover(isPresented: $playing) {
                VideoPlayerScreen(chapter: chapter, title: service.title(chapter: chapter) ?? "")
            }
            .alert("解锁完整版后观看", isPresented: $showsLockedAlert) {
                Button("好", role: .cancel) {}
            } message: {
                Text("第 1 章的动画讲解免费，其余章节需要完整版。")
            }
        }
    }
}
