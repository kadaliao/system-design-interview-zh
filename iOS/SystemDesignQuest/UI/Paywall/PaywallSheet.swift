import SwiftUI

/// 付费墙：点到锁定的章节、口述卡或视频时弹出，说明完整版内容，一次性购买或恢复购买。
struct PaywallSheet: View {
    let reason: Router.PaywallReason
    @Environment(ProgressStore.self) private var store
    @Environment(Entitlements.self) private var entitlements
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    header
                    features
                    PurchaseControls()
                    Text("一次购买，永久解锁，无订阅。购买记录跟随你的 Apple 账号，换设备可恢复购买。")
                        .font(.rounded(13))
                        .foregroundStyle(Palette.secondaryText)
                        .multilineTextAlignment(.center)
                }
                .padding(20)
                .readableWidth()
            }
            .screenBackground()
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("关闭") { dismiss() }.font(.rounded(17, .bold))
                }
            }
        }
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(entitlements.purchaseState == .purchasing)
        .onChange(of: entitlements.hasFullAccess) { _, unlocked in
            if unlocked {
                router.toast = String(localized: "完整版已解锁")
                dismiss()
            }
        }
        .onDisappear { entitlements.resetTransientState() }
        .task { if entitlements.product == nil { await entitlements.loadProduct() } }
    }

    private var header: some View {
        VStack(spacing: 12) {
            Image(systemName: "lock.open.fill")
                .font(.system(size: 36, weight: .heavy))
                .foregroundStyle(.white)
                .frame(width: 80, height: 80)
                .background(Circle().fill(Palette.gold))
                .background(Circle().fill(Palette.goldShadow).offset(y: 5))
                .padding(.top, 12)
            Text("解锁完整版")
                .font(.rounded(28, .heavy))
                .foregroundStyle(Palette.text)
            Text(subtitle)
                .font(.rounded(16))
                .foregroundStyle(Palette.secondaryText)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var subtitle: LocalizedStringKey {
        switch reason {
        case let .chapter(n):
            let title = store.library.chapter(n)?.title ?? ""
            return "第 \(n) 章「\(title)」属于完整版内容。第 1 章可以免费学完，其余章节一次购买后全部解锁。"
        case .cards:
            return "口述练习的这些题目属于完整版内容。第 1 章的口述卡可以免费练。"
        case let .video(n):
            return "第 \(n) 章的讲解视频属于完整版内容。第 1 章的视频可以免费看。"
        case .general:
            return "第 1 章可以免费学完，其余章节一次购买后全部解锁。"
        }
    }

    private var features: some View {
        let chapters = store.library.chapters.count
        return VStack(alignment: .leading, spacing: 14) {
            FeatureRow(symbol: "map.fill", color: Palette.green,
                       text: "第 2–\(chapters) 章全部课程、单元测验与交互实验，\(store.library.allExercises.count) 道闯关题")
            FeatureRow(symbol: "mic.fill", color: Palette.purple,
                       text: "全部 \(store.library.course.cards.count) 张口述卡与通用复盘题")
            FeatureRow(symbol: "play.rectangle.fill", color: Palette.blue, text: "各章讲解视频")
            FeatureRow(symbol: "dumbbell.fill", color: Palette.orange, text: "随机练习与错题复习覆盖全部章节")
            FeatureRow(symbol: "infinity", color: Palette.gold, text: "一次购买永久使用，后续内容更新免费")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Palette.card))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.border, lineWidth: 2))
    }
}

private struct FeatureRow: View {
    let symbol: String
    let color: Color
    let text: LocalizedStringKey

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 30, height: 30)
                .background(RoundedRectangle(cornerRadius: 9).fill(color))
            Text(text)
                .font(.rounded(15, .semibold))
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// 购买按钮、恢复购买和状态提示；付费墙与设置页共用。
struct PurchaseControls: View {
    @Environment(Entitlements.self) private var entitlements

    var body: some View {
        VStack(spacing: 10) {
            Button {
                Task { await entitlements.purchase() }
            } label: {
                if entitlements.purchaseState == .purchasing {
                    ProgressView().tint(.white)
                } else {
                    Text(buyTitle)
                }
            }
            .buttonStyle(ChunkyButtonStyle(fill: Palette.green, shadow: Palette.greenShadow))
            .disabled(busy)
            .accessibilityIdentifier("paywall.buy")

            if entitlements.product == nil && entitlements.productLoadFailed {
                Button("重新加载价格") { Task { await entitlements.loadProduct() } }
                    .font(.rounded(14, .bold))
                    .foregroundStyle(Palette.blueShadow)
            }

            Button {
                Task { await entitlements.restore() }
            } label: {
                if entitlements.purchaseState == .restoring {
                    ProgressView()
                } else {
                    Text("恢复购买")
                }
            }
            .font(.rounded(16, .bold))
            .foregroundStyle(Palette.blueShadow)
            .padding(.vertical, 6)
            .disabled(busy)
            .accessibilityIdentifier("paywall.restore")

            if let message {
                Text(message.text)
                    .font(.rounded(14, .semibold))
                    .foregroundStyle(message.isError ? Palette.wrongText : Palette.secondaryText)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var busy: Bool { entitlements.purchaseState == .purchasing || entitlements.purchaseState == .restoring }

    private var buyTitle: LocalizedStringKey {
        if let price = entitlements.displayPrice { return "解锁完整版 · \(price)" }
        return "解锁完整版"
    }

    private var message: (text: String, isError: Bool)? {
        switch entitlements.purchaseState {
        case .pending: (String(localized: "购买正在等待批准，批准后会自动解锁。"), false)
        case let .failed(reason): (reason, true)
        case .nothingToRestore: (String(localized: "没有找到可恢复的购买记录。请确认登录的是购买时的 Apple 账号。"), true)
        default: nil
        }
    }
}
