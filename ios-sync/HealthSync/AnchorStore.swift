import Foundation
import HealthKit

/// Persists HKQueryAnchor per data type using UserDefaults
/// Anchors allow resuming queries from where we left off (delta fetching)
actor AnchorStore {
    private let defaults = UserDefaults.standard
    private let keyPrefix = "healthsync.anchor."

    func getAnchor(for type: HealthDataType) -> HKQueryAnchor? {
        guard let data = defaults.data(forKey: keyPrefix + type.rawValue) else {
            return nil
        }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    func setAnchor(_ anchor: HKQueryAnchor?, for type: HealthDataType) {
        if let anchor = anchor {
            if let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) {
                defaults.set(data, forKey: keyPrefix + type.rawValue)
            }
        } else {
            defaults.removeObject(forKey: keyPrefix + type.rawValue)
        }
    }

    func clearAnchor(for type: HealthDataType) {
        defaults.removeObject(forKey: keyPrefix + type.rawValue)
    }

    func clearAllAnchors() {
        for type in HealthDataType.allCases {
            defaults.removeObject(forKey: keyPrefix + type.rawValue)
        }
    }

    // MARK: - Last Sync Time Tracking

    private let lastSyncKeyPrefix = "healthsync.lastsync."

    func getLastSyncTime(for type: HealthDataType) -> Date? {
        let timestamp = defaults.double(forKey: lastSyncKeyPrefix + type.rawValue)
        return timestamp > 0 ? Date(timeIntervalSince1970: timestamp) : nil
    }

    func setLastSyncTime(_ date: Date, for type: HealthDataType) {
        defaults.set(date.timeIntervalSince1970, forKey: lastSyncKeyPrefix + type.rawValue)
    }
}
