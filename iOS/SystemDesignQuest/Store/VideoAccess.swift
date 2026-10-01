import Foundation

/// 能不能看某章视频。之后接 `Entitlements`（`hasFullAccess` / `isUnlocked(chapter:)`）时只需实现这个协议。
@MainActor
protocol VideoAccessChecking: AnyObject {
    func canPlay(chapter: Int) -> Bool
}

/// 默认实现：只放行第 1 章，其余返回 false（由 `VideoService.requestPlayback` 回调「需要付费墙」）。
@MainActor
final class DefaultVideoAccess: VideoAccessChecking {
    nonisolated static let freeChapters: Set<Int> = [1]

    func canPlay(chapter: Int) -> Bool { Self.freeChapters.contains(chapter) }
}

/// 调试用（`-videoUnlockAll`）：全部放行。
@MainActor
final class UnlockedVideoAccess: VideoAccessChecking {
    func canPlay(chapter: Int) -> Bool { true }
}

/// 正式实现：跟随内购状态（第 1 章免费，其余需要完整版）。
@MainActor
final class EntitlementVideoAccess: VideoAccessChecking {
    private let entitlements: any EntitlementProviding

    init(_ entitlements: any EntitlementProviding) { self.entitlements = entitlements }

    func canPlay(chapter: Int) -> Bool { entitlements.isUnlocked(chapter: chapter) }
}
