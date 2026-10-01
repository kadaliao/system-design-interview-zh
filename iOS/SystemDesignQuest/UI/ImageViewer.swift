import SwiftUI
import UIKit

/// 全屏看图：双指缩放、双击放大或还原、拖动平移；未放大时上下轻扫关闭。
struct ImageViewer: View {
    let image: UIImage
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZoomableImage(image: image) { dismiss() }
            .ignoresSafeArea()
            .background(Color.black.ignoresSafeArea())
            .overlay(alignment: .topTrailing) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(.white.opacity(0.18)))
                }
                .padding(.trailing, 16)
                .padding(.top, 8)
                .accessibilityLabel("关闭")
            }
            .statusBarHidden()
    }
}

private struct ZoomableImage: UIViewRepresentable {
    let image: UIImage
    let onDismiss: () -> Void

    func makeUIView(context: Context) -> ZoomScrollView {
        ZoomScrollView(image: image, onDismiss: onDismiss)
    }

    func updateUIView(_ view: ZoomScrollView, context: Context) {}
}

/// 图片按屏幕等比缩到完整可见为最小倍率，最多放大到它的 4 倍；图片小于屏幕时居中。
private final class ZoomScrollView: UIScrollView, UIScrollViewDelegate {
    private let imageView: UIImageView
    private let onDismiss: () -> Void
    private var fittedSize = CGSize.zero

    init(image: UIImage, onDismiss: @escaping () -> Void) {
        imageView = UIImageView(image: image)
        self.onDismiss = onDismiss
        super.init(frame: .zero)
        delegate = self
        backgroundColor = .clear
        showsHorizontalScrollIndicator = false
        showsVerticalScrollIndicator = false
        decelerationRate = .fast
        contentInsetAdjustmentBehavior = .never
        alwaysBounceVertical = true
        imageView.isAccessibilityElement = true
        imageView.accessibilityLabel = String(localized: "图片，双指缩放，双击放大或还原")
        addSubview(imageView)
        contentSize = image.size

        let doubleTap = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
        doubleTap.numberOfTapsRequired = 2
        addGestureRecognizer(doubleTap)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        if bounds.size != fittedSize, bounds.width > 0, bounds.height > 0 {
            // 首次布局或 iPad 转屏：重新计算倍率并回到完整可见
            fittedSize = bounds.size
            let size = imageView.bounds.size
            let fit = min(bounds.width / size.width, bounds.height / size.height)
            minimumZoomScale = fit
            maximumZoomScale = fit * 4
            zoomScale = fit
        }
        var frame = imageView.frame
        frame.origin.x = frame.width < bounds.width ? (bounds.width - frame.width) / 2 : 0
        frame.origin.y = frame.height < bounds.height ? (bounds.height - frame.height) / 2 : 0
        imageView.frame = frame
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

    func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
        let pull = contentOffset.y + contentInset.top
        let overshoot = pull < 0 ? -pull : pull - max(0, contentSize.height - bounds.height)
        if zoomScale <= minimumZoomScale * 1.01, overshoot > 90 { onDismiss() }
    }

    @objc private func handleDoubleTap(_ gesture: UITapGestureRecognizer) {
        if zoomScale > minimumZoomScale * 1.01 {
            setZoomScale(minimumZoomScale, animated: true)
        } else {
            let scale = min(maximumZoomScale, minimumZoomScale * 2.5)
            let point = gesture.location(in: imageView)
            let size = CGSize(width: bounds.width / scale, height: bounds.height / scale)
            zoom(to: CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2,
                            width: size.width, height: size.height), animated: true)
        }
    }
}
