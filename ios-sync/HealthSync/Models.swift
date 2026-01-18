import Foundation
import HealthKit
import UIKit

// MARK: - Health Data Types

enum HealthDataType: String, CaseIterable, Codable {
    case stepCount = "HKQuantityTypeIdentifierStepCount"
    case heartRate = "HKQuantityTypeIdentifierHeartRate"
    case activeEnergyBurned = "HKQuantityTypeIdentifierActiveEnergyBurned"
    case workout = "HKWorkoutType"
    case sleepAnalysis = "HKCategoryTypeIdentifierSleepAnalysis"
    case bodyMass = "HKQuantityTypeIdentifierBodyMass"
    case vo2Max = "HKQuantityTypeIdentifierVO2Max"

    var hkSampleType: HKSampleType? {
        switch self {
        case .stepCount:
            return HKQuantityType(.stepCount)
        case .heartRate:
            return HKQuantityType(.heartRate)
        case .activeEnergyBurned:
            return HKQuantityType(.activeEnergyBurned)
        case .workout:
            return HKWorkoutType.workoutType()
        case .sleepAnalysis:
            return HKCategoryType(.sleepAnalysis)
        case .bodyMass:
            return HKQuantityType(.bodyMass)
        case .vo2Max:
            return HKQuantityType(.vo2Max)
        }
    }

    var displayName: String {
        switch self {
        case .stepCount: return "Steps"
        case .heartRate: return "Heart Rate"
        case .activeEnergyBurned: return "Active Energy"
        case .workout: return "Workouts"
        case .sleepAnalysis: return "Sleep"
        case .bodyMass: return "Weight"
        case .vo2Max: return "VO2 Max"
        }
    }
}

// MARK: - Sync Payloads

struct HealthRecordPayload: Codable {
    let recordType: String
    let sourceName: String
    let sourceBundle: String?
    let value: Double?
    let valueText: String?
    let unit: String?
    let startTime: Date
    let endTime: Date
    let metadata: [String: String]?
}

struct WorkoutPayload: Codable {
    let workoutType: String
    let sourceName: String
    let sourceBundle: String?
    let startTime: Date
    let endTime: Date
    let durationSeconds: Double
    let totalDistance: Double?
    let totalEnergyBurned: Double?
    let statistics: [String: Double]?
    let metadata: [String: String]?
}

struct SyncBatch: Codable {
    let dataType: String
    let records: [HealthRecordPayload]?
    let workouts: [WorkoutPayload]?
    let deletedUUIDs: [String]
    let deviceId: String
    let timestamp: Date
}

// MARK: - Sync Status

struct TypeSyncStatus: Identifiable {
    let id: String
    let type: HealthDataType
    var lastSyncTime: Date?
    var lastSyncCount: Int?  // nil = never synced, 0 = up to date, >0 = records synced
    var lastError: String?
    var pendingCount: Int
    var isAuthorized: Bool

    init(type: HealthDataType) {
        self.id = type.rawValue
        self.type = type
        self.lastSyncTime = nil
        self.lastSyncCount = nil
        self.lastError = nil
        self.pendingCount = 0
        self.isAuthorized = false
    }
}

// MARK: - App Configuration

struct SyncConfig {
    static let serverURL = "https://fit.justslobo.com/api/sync"
    static let refreshURL = "https://fit.justslobo.com/api/sync/refresh"
    static let batchSize = 1000
    static let backfillDays = 30 // Initial backfill window
    static let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown"

    static var apiSecret: String {
        guard let path = Bundle.main.path(forResource: "Secrets", ofType: "plist"),
              let dict = NSDictionary(contentsOfFile: path),
              let secret = dict["API_SECRET"] as? String else {
            fatalError("Missing Secrets.plist or API_SECRET key. Copy Secrets.plist.example to Secrets.plist and add your secret.")
        }
        return secret
    }
}

// MARK: - Extensions

extension HKQuantitySample {
    func toPayload() -> HealthRecordPayload {
        let unit: HKUnit
        let unitString: String

        switch quantityType.identifier {
        case HKQuantityTypeIdentifier.stepCount.rawValue:
            unit = .count()
            unitString = "count"
        case HKQuantityTypeIdentifier.heartRate.rawValue:
            unit = HKUnit.count().unitDivided(by: .minute())
            unitString = "count/min"
        case HKQuantityTypeIdentifier.activeEnergyBurned.rawValue:
            unit = .kilocalorie()
            unitString = "kcal"
        case HKQuantityTypeIdentifier.bodyMass.rawValue:
            unit = .pound()
            unitString = "lb"
        case HKQuantityTypeIdentifier.vo2Max.rawValue:
            unit = HKUnit.literUnit(with: .milli).unitDivided(by: .minute()).unitDivided(by: .gramUnit(with: .kilo))
            unitString = "mL/min·kg"
        default:
            unit = .count()
            unitString = "count"
        }

        return HealthRecordPayload(
            recordType: quantityType.identifier,
            sourceName: sourceRevision.source.name,
            sourceBundle: sourceRevision.source.bundleIdentifier,
            value: quantity.doubleValue(for: unit),
            valueText: nil,
            unit: unitString,
            startTime: startDate,
            endTime: endDate,
            metadata: metadata?.compactMapValues { "\($0)" }
        )
    }
}

extension HKCategorySample {
    func toPayload() -> HealthRecordPayload {
        let valueText: String
        if categoryType.identifier == HKCategoryTypeIdentifier.sleepAnalysis.rawValue {
            valueText = sleepValueString(value)
        } else {
            valueText = "\(value)"
        }

        return HealthRecordPayload(
            recordType: categoryType.identifier,
            sourceName: sourceRevision.source.name,
            sourceBundle: sourceRevision.source.bundleIdentifier,
            value: Double(value),
            valueText: valueText,
            unit: nil,
            startTime: startDate,
            endTime: endDate,
            metadata: metadata?.compactMapValues { "\($0)" }
        )
    }

    private func sleepValueString(_ value: Int) -> String {
        guard let sleepValue = HKCategoryValueSleepAnalysis(rawValue: value) else {
            return "Unknown"
        }
        switch sleepValue {
        case .inBed: return "InBed"
        case .asleepUnspecified: return "AsleepUnspecified"
        case .awake: return "Awake"
        case .asleepCore: return "AsleepCore"
        case .asleepDeep: return "AsleepDeep"
        case .asleepREM: return "AsleepREM"
        @unknown default: return "Unknown"
        }
    }
}

extension HKWorkout {
    /// Filter out junk workouts - only sync real workout types from watch
    var shouldSync: Bool {
        // Only sync from watch sources
        let validSources = ["watch", "apple watch"]
        let sourceLower = sourceRevision.source.name.lowercased()
        guard validSources.contains(where: { sourceLower.contains($0) }) else {
            return false
        }

        // Only sync real workout types, not "Other"
        let validTypes: [HKWorkoutActivityType] = [
            .walking, .running, .cycling, .swimming,
            .traditionalStrengthTraining, .functionalStrengthTraining,
            .hiking, .yoga, .elliptical, .rowing,
            .coreTraining, .highIntensityIntervalTraining,
            .crossTraining, .stairClimbing, .stairs,
            .climbing, .jumpRope, .paddleSports,
            .underwaterDiving, .crossCountrySkiing, .downhillSkiing,
            .snowboarding, .skatingSports, .tennis, .golf
        ]
        return validTypes.contains(workoutActivityType)
    }

    func toPayload() -> WorkoutPayload {
        var stats: [String: Double] = [:]

        // Extract statistics if available
        if let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate) {
            if let hrStats = statistics(for: hrType) {
                let unit = HKUnit.count().unitDivided(by: .minute())
                if let avg = hrStats.averageQuantity() {
                    stats["heartRateAvg"] = avg.doubleValue(for: unit)
                }
                if let min = hrStats.minimumQuantity() {
                    stats["heartRateMin"] = min.doubleValue(for: unit)
                }
                if let max = hrStats.maximumQuantity() {
                    stats["heartRateMax"] = max.doubleValue(for: unit)
                }
            }
        }

        return WorkoutPayload(
            workoutType: workoutActivityType.name,
            sourceName: sourceRevision.source.name,
            sourceBundle: sourceRevision.source.bundleIdentifier,
            startTime: startDate,
            endTime: endDate,
            durationSeconds: duration,
            totalDistance: totalDistance?.doubleValue(for: .mile()),
            totalEnergyBurned: totalEnergyBurned?.doubleValue(for: .kilocalorie()),
            statistics: stats.isEmpty ? nil : stats,
            metadata: metadata?.compactMapValues { "\($0)" }
        )
    }
}

extension HKWorkoutActivityType {
    var name: String {
        switch self {
        case .walking: return "HKWorkoutActivityTypeWalking"
        case .running: return "HKWorkoutActivityTypeRunning"
        case .cycling: return "HKWorkoutActivityTypeCycling"
        case .swimming: return "HKWorkoutActivityTypeSwimming"
        case .traditionalStrengthTraining: return "HKWorkoutActivityTypeTraditionalStrengthTraining"
        case .functionalStrengthTraining: return "HKWorkoutActivityTypeFunctionalStrengthTraining"
        case .hiking: return "HKWorkoutActivityTypeHiking"
        case .yoga: return "HKWorkoutActivityTypeYoga"
        case .elliptical: return "HKWorkoutActivityTypeElliptical"
        case .rowing: return "HKWorkoutActivityTypeRowing"
        default: return "HKWorkoutActivityTypeOther"
        }
    }
}
