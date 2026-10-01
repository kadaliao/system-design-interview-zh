import Foundation
import Observation
import StoreKit

/// 内容门控：哪些章节、口述卡、视频需要购买完整版。视频模块与 UI 都只依赖这个协议。
@MainActor
protocol EntitlementProviding: AnyObject {
    var hasFullAccess: Bool { get }
}

extension EntitlementProviding {
    /// 免费章节：第 1 章。其余章节和通用复盘卡（chapter == 0）需要完整版。
    func isUnlocked(chapter: Int) -> Bool {
        hasFullAccess || EntitlementRules.freeChapters.contains(chapter)
    }

    func isUnlockedCard(_ card: Card) -> Bool { isUnlocked(chapter: card.chapter) }
}

enum EntitlementRules {
    static let freeChapters: ClosedRange<Int> = 1...1
}

/// 固定结果的实现：测试、预览，以及不接内购的场景。
@MainActor
final class StaticEntitlements: EntitlementProviding {
    var hasFullAccess: Bool
    init(hasFullAccess: Bool) { self.hasFullAccess = hasFullAccess }
}

/// 一次性内购（非消耗型）：解锁完整版。StoreKit 2 为准；离线时沿用上次验证结果。
@MainActor
@Observable
final class Entitlements: EntitlementProviding {
    nonisolated static let productID = "com.kadaliao.SystemDesignQuest.full"

    enum PurchaseState: Equatable {
        case idle
        case purchasing
        /// 等待家长批准等外部确认，批准后会通过 Transaction.updates 到账。
        case pending
        case cancelled
        case failed(String)
        case purchased
        case restoring
        case restored
        case nothingToRestore
    }

    private(set) var product: Product?
    private(set) var purchaseState: PurchaseState = .idle
    /// 商品信息加载失败（离线、商品未配置等）。
    private(set) var productLoadFailed = false
    /// 最近一次查询商品是抛了错（多半是网络问题），还是正常返回但没有这个商品（比如商品还没在 App Store 上架）。
    private(set) var productLookupThrew = false
    private var storeUnlocked: Bool
    private var debugUnlocked: Bool

    /// 完整版是否可用。DEBUG 构建里 `-unlockAll` 可强制解锁，Release 里这个分支不存在。
    var hasFullAccess: Bool {
        #if DEBUG
        if debugUnlocked { return true }
        #endif
        return storeUnlocked
    }

    var displayPrice: String? { product?.displayPrice }

    @ObservationIgnored private let productID: String
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var updatesTask: Task<Void, Never>?
    @ObservationIgnored private static let mirrorKey = "entitlements.fullAccess.mirror"

    init(productID: String = Entitlements.productID, defaults: UserDefaults = .standard, debugUnlockAll: Bool = false) {
        self.productID = productID
        self.defaults = defaults
        self.storeUnlocked = defaults.bool(forKey: Self.mirrorKey)
        self.debugUnlocked = false
        #if DEBUG
        self.debugUnlocked = debugUnlockAll
        #endif
    }

    // MARK: - 生命周期

    /// App 启动时调用一次：监听交易更新、用本地交易校验已有权益。商品（价格）不在这里查，付费墙打开或购买时才联网查询。
    func start() {
        guard updatesTask == nil else { return }
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                await self.handle(result, fromPurchase: false)
            }
        }
        Task { [weak self] in
            // 启动时只用本地交易校验权益（离线也可用）。商品价格留到打开付费墙时再联网查询：
            // 启动就查商品没有必要，在没有登录 Apple 账户的设备（如干净的模拟器）上还会弹出登录框。
            await self?.refreshEntitlements()
        }
    }

    func stop() {
        updatesTask?.cancel()
        updatesTask = nil
    }

    // MARK: - 商品

    func loadProduct() async {
        do {
            product = try await Product.products(for: [productID]).first
            productLoadFailed = product == nil
            productLookupThrew = false
        } catch {
            productLoadFailed = true
            productLookupThrew = true
        }
    }

    // MARK: - 购买与恢复

    func purchase() async {
        guard purchaseState != .purchasing, purchaseState != .restoring else { return }
        if product == nil { await loadProduct() }
        guard let product else {
            purchaseState = .failed(productLookupThrew
                ? String(localized: "暂时无法连接 App Store，请检查网络后重试。")
                : String(localized: "暂时找不到该商品，请稍后再试。"))
            return
        }
        purchaseState = .purchasing
        do {
            switch try await product.purchase() {
            case let .success(result):
                await handle(result, fromPurchase: true)
            case .pending:
                purchaseState = .pending
            case .userCancelled:
                purchaseState = .cancelled
            @unknown default:
                purchaseState = .failed(String(localized: "购买没有完成，请稍后重试。"))
            }
        } catch {
            purchaseState = .failed(String(localized: "购买没有完成：\(error.localizedDescription)"))
        }
    }

    func restore() async {
        guard purchaseState != .purchasing, purchaseState != .restoring else { return }
        purchaseState = .restoring
        do {
            try await AppStore.sync()
        } catch {
            if case StoreKitError.userCancelled = error {
                purchaseState = .cancelled
            } else {
                purchaseState = .failed(String(localized: "恢复购买失败：\(error.localizedDescription)"))
            }
            return
        }
        await refreshEntitlements()
        purchaseState = hasFullAccess ? .restored : .nothingToRestore
    }

    // MARK: - 校验

    /// 用 `Transaction.currentEntitlements` 重新计算是否拥有完整版。
    /// 找到有效交易 → 解锁；交易被退款撤销 → 锁回；只有校验失败的交易，或离线且没有任何交易信息 → 沿用上次结果。
    func refreshEntitlements() async {
        var entitled = false
        var unverified = false
        for await result in Transaction.currentEntitlements {
            switch result {
            case let .verified(transaction) where transaction.productID == productID:
                if transaction.revocationDate == nil { entitled = true }
            case let .unverified(transaction, _) where transaction.productID == productID:
                unverified = true
            default:
                break
            }
        }
        if entitled {
            setUnlocked(true)
        } else if unverified {
            return
        } else if product != nil || !storeUnlocked {
            // 联网拿到商品信息后没有有效交易（退款、从未购买）：以 StoreKit 为准
            setUnlocked(false)
        }
    }

    private func handle(_ result: VerificationResult<Transaction>, fromPurchase: Bool) async {
        switch result {
        case let .verified(transaction):
            guard transaction.productID == productID else {
                await transaction.finish()
                return
            }
            if transaction.revocationDate != nil {
                setUnlocked(false)
            } else {
                setUnlocked(true)
                if fromPurchase || purchaseState == .pending { purchaseState = .purchased }
            }
            await transaction.finish()
        case .unverified:
            if fromPurchase { purchaseState = .failed(String(localized: "无法验证这笔购买，请稍后重试，或点「恢复购买」。")) }
        }
    }

    private func setUnlocked(_ value: Bool) {
        storeUnlocked = value
        defaults.set(value, forKey: Self.mirrorKey)
    }

    /// 关闭付费墙或离开页面后清掉一次性的提示状态。
    func resetTransientState() {
        switch purchaseState {
        case .purchasing, .restoring: break
        default: purchaseState = .idle
        }
    }
}
