import SwiftUI

/// 设置页的「视频缓存」小节。
struct VideoCacheSection: View {
    @AppStorage(VideoCache.wifiOnlyKey) private var wifiOnly = true
    @State private var bytes: Int64 = 0
    @State private var confirmClear = false
    private let cache = VideoService.shared.cache

    var body: some View {
        Section {
            LabeledContent("已缓存", value: VideoFormat.bytes(bytes))
            Button("清除视频缓存", role: .destructive) { confirmClear = true }
                .disabled(bytes == 0)
            Toggle("仅 Wi-Fi 下载", isOn: $wifiOnly)
        } header: {
            Text("视频缓存")
        } footer: {
            Text("看过的动画讲解会缓存在本机，下次可以离线观看。开启后，只在 Wi-Fi 下自动缓存；蜂窝网络下仍可手动观看，每章约 5 MB。第 1 章的视频已内置，不占缓存。")
        }
        .task { bytes = await cache.totalBytes() }
        .confirmationDialog("清除全部已缓存的视频？之后观看会重新下载。", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("清除", role: .destructive) {
                Task {
                    await cache.clearAll()
                    bytes = await cache.totalBytes()
                }
            }
            Button("取消", role: .cancel) {}
        }
    }
}
