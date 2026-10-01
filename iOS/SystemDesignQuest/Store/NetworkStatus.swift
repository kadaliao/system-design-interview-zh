import Foundation
import Network
import Synchronization

enum NetworkStatus: Sendable, Equatable {
    case offline
    /// 非计费网络（Wi-Fi、以太网）。
    case unmetered
    /// 蜂窝、个人热点或低数据模式。
    case metered
}

protocol NetworkStatusProviding: Sendable {
    var status: NetworkStatus { get }
}

/// 基于 `NWPathMonitor` 的实时网络状态。
final class PathMonitor: NetworkStatusProviding, Sendable {
    private final class Box: Sendable {
        let value = Mutex<NetworkStatus>(.unmetered)
    }

    private let monitor = NWPathMonitor()
    private let current = Box()

    init() {
        monitor.pathUpdateHandler = { [current] path in
            let status: NetworkStatus
            if path.status != .satisfied {
                status = .offline
            } else if path.isExpensive || path.isConstrained {
                status = .metered
            } else {
                status = .unmetered
            }
            current.value.withLock { $0 = status }
        }
        monitor.start(queue: DispatchQueue(label: "video.pathmonitor"))
    }

    var status: NetworkStatus { current.value.withLock { $0 } }

    deinit { monitor.cancel() }
}

/// 固定状态，测试用。
final class FixedNetwork: NetworkStatusProviding, Sendable {
    private let value: Mutex<NetworkStatus>
    init(_ status: NetworkStatus) { value = Mutex(status) }
    var status: NetworkStatus {
        get { value.withLock { $0 } }
        set { value.withLock { $0 = newValue } }
    }
}
