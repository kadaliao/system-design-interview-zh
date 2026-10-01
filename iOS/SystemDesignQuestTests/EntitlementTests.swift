import Foundation
import StoreKit
import StoreKitTest
import Testing
@testable import SystemDesignQuest

private func card(_ id: String, chapter: Int) -> Card {
    let json = """
    {"id": "\(id)", "chapter": \(chapter), "category": "c", "question": "q", "conclusion": "c", "anchor": "a", "blocks": []}
    """
    return try! JSONDecoder().decode(Card.self, from: Data(json.utf8))
}

@Suite("内容门控")
@MainActor
struct GatingTests {
    let library = Fixtures.library()
    let free = StaticEntitlements(hasFullAccess: false)
    let full = StaticEntitlements(hasFullAccess: true)

    private func store(_ entitlements: StaticEntitlements) -> ProgressStore {
        ProgressStore(library: library, fileURL: nil, calendar: Fixtures.calendar, entitlements: entitlements)
    }

    @Test func chapterRules() {
        #expect(free.isUnlocked(chapter: 1))
        #expect(!free.isUnlocked(chapter: 2))
        #expect(!free.isUnlocked(chapter: 0), "通用复盘卡属于完整版")
        #expect(!free.isUnlockedCard(card("Q02-01", chapter: 2)))
        #expect(!free.isUnlockedCard(card("R-01", chapter: 0)))
        #expect(free.isUnlockedCard(card("Q01-01", chapter: 1)))
        #expect(full.isUnlocked(chapter: 28))
        #expect(full.isUnlockedCard(card("R-01", chapter: 0)))
    }

    @Test func premiumNodesIgnoreFreeModeAndNeverBlock() {
        let nodes = LearningPath.allNodes(in: library)
        let done: Set<String> = ["c01-01", "c01-02", "c01-test"]
        for freeMode in [false, true] {
            let states = LearningPath.states(for: nodes, isCompleted: { done.contains($0.id) }, freeMode: freeMode,
                                             isChapterUnlocked: { free.isUnlocked(chapter: $0) })
            #expect(states["c02-01"] == .premium)
            #expect(states["c01-labs"] == .available)
            #expect(!states.values.contains(.current), "第 1 章学完、第 2 章未购买时没有当前关卡")
        }
        // 已完成的付费章节在退款后同样锁住
        let revoked = LearningPath.states(for: nodes, isCompleted: { _ in true }, freeMode: false,
                                          isChapterUnlocked: { free.isUnlocked(chapter: $0) })
        #expect(revoked["c02-01"] == .premium)
        #expect(revoked["c01-01"] == .completed)
    }

    @Test func unlockingRestoresSequentialStates() {
        let store = store(free)
        store.seedForDemo { state in
            for id in ["c01-01", "c01-02"] { state.lessons[id] = .init(firstCompleted: .now, lastCompleted: .now, timesCompleted: 1, bestAccuracy: 1) }
        }
        #expect(store.nodeStates()["c02-01"] == .premium)
        free.hasFullAccess = true
        #expect(store.nodeStates()["c02-01"] == .locked, "解锁后仍按顺序：先通过第 1 章测验")
        free.hasFullAccess = false
    }

    @Test func practicePoolOnlyHasUnlockedLessons() {
        let store = store(StaticEntitlements(hasFullAccess: false))
        store.seedForDemo { state in
            for id in ["c01-01", "c02-01"] { state.lessons[id] = .init(firstCompleted: .now, lastCompleted: .now, timesCompleted: 1, bestAccuracy: 1) }
        }
        #expect(store.learnedExercises.allSatisfy { $0.chapter == 1 })
        #expect(store.practicePool.allSatisfy { $0.chapter == 1 })
        let all = self.store(full)
        all.seedForDemo { state in
            for id in ["c01-01", "c02-01"] { state.lessons[id] = .init(firstCompleted: .now, lastCompleted: .now, timesCompleted: 1, bestAccuracy: 1) }
        }
        #expect(all.learnedExercises.contains { $0.chapter == 2 })
    }

    @Test func emptyPracticePoolFallsBackToFreeChapter() {
        let store = store(free)
        #expect(!store.practicePool.isEmpty)
        #expect(store.practicePool.allSatisfy { $0.chapter == 1 })
    }

    @Test func mistakesAndCardsAreFiltered() {
        let store = store(free)
        store.seedForDemo { state in
            state.mistakes["c01-01-01"] = MistakeMemory(missedAt: .distantPast)
            state.mistakes["c02-01-01"] = MistakeMemory(missedAt: .distantPast)
        }
        #expect(store.mistakeIDs == ["c01-01-01"])
        #expect(store.mistakeSession().allSatisfy { $0.chapter == 1 })
        #expect(store.dueCards().allSatisfy { $0.chapter == 1 })
        #expect(!store.dueCards().isEmpty)
    }

    @Test func routerShowsPaywallInsteadOfLockedContent() throws {
        let store = store(free)
        let router = Router()
        router.store = store
        let ch2 = try #require(library.chapter(2))
        router.startLesson(ch2.lessons[0], store: store)
        #expect(router.screen == nil)
        #expect(router.paywall == .chapter(2))

        router.paywall = nil
        router.startUnitTest(chapter: ch2, store: store)
        #expect(router.screen == nil && router.paywall == .chapter(2))

        router.paywall = nil
        router.startLesson(try #require(library.chapter(1)).lessons[0], store: store)
        #expect(router.screen != nil && router.paywall == nil)
    }

    @Test func routerCardsKeepOnlyUnlocked() {
        let store = store(free)
        let router = Router()
        router.store = store
        router.startCards([card("Q02-01", chapter: 2), card("R-01", chapter: 0)], title: "t")
        #expect(router.screen == nil && router.paywall == .cards)

        router.paywall = nil
        router.startCards([card("Q01-01", chapter: 1), card("Q02-01", chapter: 2)], title: "t")
        guard case let .cards(cards, _)? = router.screen else { Issue.record("应打开第 1 章的卡"); return }
        #expect(cards.map(\.id) == ["Q01-01"])
        #expect(router.paywall == nil)
    }

    @Test func routerBlocksPaidLabs() throws {
        let store = store(free)
        let router = Router()
        router.store = store
        let lab = try #require(library.chapter(1)?.labs.first)
        router.openLab(lab)
        #expect(router.screen != nil)
        router.screen = nil
        let paid = try JSONDecoder().decode(Lab.self, from: Data(#"{"id":"x","title":"t","summary":"s","file":"f"}"#.utf8))
        router.openLab(paid)   // 不属于任何章节的实验不拦截
        #expect(router.screen != nil)
    }

    @Test func fullAccessOpensEverything() throws {
        let store = store(full)
        let router = Router()
        router.store = store
        router.startLesson(try #require(library.chapter(2)).lessons[0], store: store)
        #expect(router.screen != nil && router.paywall == nil)
    }
}

/// 用 StoreKitTest 跑真实的 StoreKit 2 流程：购买、恢复、退款、待批准、失败。
@Suite("内购流程（StoreKitTest）", .serialized)
@MainActor
struct PurchaseFlowTests {
    private static let configURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .appending(path: "SystemDesignQuest/Products.storekit")

    /// SKTestSession 释放后配置就失效，用静态变量持有到下一个测试。
    private static var current: SKTestSession?

    private func makeSession() throws -> SKTestSession {
        let session = try SKTestSession(contentsOf: Self.configURL)
        session.resetToDefaultState()
        session.clearTransactions()
        session.disableDialogs = true
        Self.current = session
        return session
    }

    private func makeEntitlements(_ suite: String = UUID().uuidString) -> (Entitlements, UserDefaults) {
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return (Entitlements(defaults: defaults), defaults)
    }

    @Test func loadsProductAndPrice() async throws {
        _ = try makeSession()
        let (entitlements, _) = makeEntitlements()
        await entitlements.loadProduct()
        #expect(entitlements.product?.id == Entitlements.productID)
        #expect(entitlements.displayPrice != nil)
        #expect(!entitlements.productLoadFailed)
    }

    @Test func purchaseUnlocksAndPersistsMirror() async throws {
        _ = try makeSession()
        let (entitlements, defaults) = makeEntitlements()
        #expect(!entitlements.hasFullAccess)
        await entitlements.purchase()
        #expect(entitlements.purchaseState == .purchased)
        #expect(entitlements.hasFullAccess)
        #expect(entitlements.isUnlocked(chapter: 5))
        // 镜像：新实例（离线启动）直接沿用
        let relaunched = Entitlements(defaults: defaults)
        #expect(relaunched.hasFullAccess)
    }

    @Test func startVerifiesExistingPurchaseAndRestoreWorks() async throws {
        let session = try makeSession()
        try await session.buyProduct(identifier: Entitlements.productID)
        let (entitlements, _) = makeEntitlements()
        #expect(!entitlements.hasFullAccess)
        for _ in 0..<30 where !entitlements.hasFullAccess {
            await entitlements.refreshEntitlements()
            try await Task.sleep(for: .milliseconds(200))
        }
        #expect(entitlements.hasFullAccess, "启动校验 currentEntitlements 后解锁")

        let (fresh, _) = makeEntitlements()
        await fresh.restore()
        #expect(fresh.hasFullAccess)
        #expect(fresh.purchaseState == .restored)
    }

    @Test func restoreWithoutPurchaseReportsNothing() async throws {
        _ = try makeSession()
        let (entitlements, _) = makeEntitlements()
        await entitlements.restore()
        #expect(!entitlements.hasFullAccess)
        #expect(entitlements.purchaseState == .nothingToRestore)
    }

    @Test func refundRelocksOnRefresh() async throws {
        let session = try makeSession()
        let (entitlements, defaults) = makeEntitlements()
        await entitlements.purchase()
        #expect(entitlements.hasFullAccess)
        let transaction = try #require(session.allTransactions().first)
        try session.refundTransaction(identifier: UInt(transaction.identifier))
        await entitlements.loadProduct()
        // 退款在 StoreKitTest 里是异步生效的
        for _ in 0..<30 {
            await entitlements.refreshEntitlements()
            if !entitlements.hasFullAccess { break }
            try await Task.sleep(for: .milliseconds(200))
        }
        #expect(!entitlements.hasFullAccess, "退款后以 StoreKit 为准锁回")
        #expect(!defaults.bool(forKey: "entitlements.fullAccess.mirror"))
    }

    @Test func askToBuyIsPendingThenApproved() async throws {
        let session = try makeSession()
        session.askToBuyEnabled = true
        let (entitlements, _) = makeEntitlements()
        entitlements.start()
        defer { entitlements.stop() }
        await entitlements.purchase()
        #expect(entitlements.purchaseState == .pending)
        #expect(!entitlements.hasFullAccess)
        let transaction = try #require(session.allTransactions().first)
        try await session.approveAskToBuyTransaction(identifier: UInt(transaction.identifier))
        for _ in 0..<50 where !entitlements.hasFullAccess { try await Task.sleep(for: .milliseconds(100)) }
        #expect(entitlements.hasFullAccess)
        #expect(entitlements.purchaseState == .purchased)
    }

    @Test func failedPurchaseKeepsLocked() async throws {
        let session = try makeSession()
        session.failTransactionsEnabled = true
        let (entitlements, _) = makeEntitlements()
        await entitlements.purchase()
        guard case .failed = entitlements.purchaseState else {
            Issue.record("应为失败状态：\(entitlements.purchaseState)")
            return
        }
        #expect(!entitlements.hasFullAccess)
    }

    @Test func offlineKeepsMirrorUntilStoreKitSaysOtherwise() async throws {
        let session = try makeSession()
        let suite = UUID().uuidString
        let (first, defaults) = makeEntitlements(suite)
        await first.purchase()
        session.clearTransactions()      // 本地没有交易信息，且没有加载过商品（模拟离线启动）
        let relaunched = Entitlements(defaults: defaults)
        await relaunched.refreshEntitlements()
        #expect(relaunched.hasFullAccess, "离线沿用上次验证结果")
        await relaunched.loadProduct()   // 联网后以 StoreKit 为准
        await relaunched.refreshEntitlements()
        #expect(!relaunched.hasFullAccess)
    }

    #if DEBUG
    @Test func debugUnlockAllForcesFullAccess() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        #expect(Entitlements(defaults: defaults, debugUnlockAll: true).hasFullAccess)
        #expect(!Entitlements(defaults: defaults, debugUnlockAll: false).hasFullAccess)
    }
    #endif
}
