import Foundation
import HealthKit
import Combine

@MainActor
class HealthKitManager: ObservableObject {
    private let healthStore = HKHealthStore()
    private var syncEngine: SyncEngine?
    private var observerQueries: [HKObserverQuery] = []

    @Published var isAuthorized = false
    @Published var authorizationError: String?
    @Published var typeStatuses: [HealthDataType: TypeSyncStatus] = [:]

    // Types to sync - all cases from the enum
    private var typesToSync: [HealthDataType] {
        HealthDataType.allCases
    }

    init() {
        // Check if we've previously requested authorization
        isAuthorized = UserDefaults.standard.bool(forKey: "healthkit_authorized")

        for type in typesToSync {
            var status = TypeSyncStatus(type: type)
            status.isAuthorized = isAuthorized
            typeStatuses[type] = status
        }
    }

    func setSyncEngine(_ engine: SyncEngine) async {
        self.syncEngine = engine
    }

    // MARK: - Authorization

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            authorizationError = "Health data not available on this device"
            return
        }

        var readTypes: Set<HKSampleType> = []
        for type in typesToSync {
            if let sampleType = type.hkSampleType {
                readTypes.insert(sampleType)
            }
        }

        do {
            try await healthStore.requestAuthorization(toShare: [], read: readTypes)
            isAuthorized = true
            authorizationError = nil

            // Persist that we've requested authorization
            UserDefaults.standard.set(true, forKey: "healthkit_authorized")

            // Update type statuses
            for type in typesToSync {
                typeStatuses[type]?.isAuthorized = true
            }

            // Set up observers after authorization
            await setupObservers()

        } catch {
            authorizationError = error.localizedDescription
            isAuthorized = false
        }
    }

    /// Called on app launch to restore state and set up observers if previously authorized
    func initializeIfAuthorized() async {
        guard isAuthorized else { return }

        // Re-request to ensure we have current permissions (silent if already granted)
        await requestAuthorization()
    }

    // MARK: - Observer Queries (Background Notifications)

    private func setupObservers() async {
        for type in typesToSync {
            guard let sampleType = type.hkSampleType else { continue }

            let query = HKObserverQuery(sampleType: sampleType, predicate: nil) { [weak self] _, completionHandler, error in
                Task { @MainActor [weak self] in
                    if let error = error {
                        print("Observer error for \(type.displayName): \(error)")
                        self?.typeStatuses[type]?.lastError = error.localizedDescription
                    } else {
                        print("Observer triggered for \(type.displayName)")
                        await self?.syncEngine?.markDirty(type)
                    }
                    completionHandler()
                }
            }

            healthStore.execute(query)
            observerQueries.append(query)

            // Enable background delivery
            do {
                try await healthStore.enableBackgroundDelivery(for: sampleType, frequency: .immediate)
                print("Background delivery enabled for \(type.displayName)")
            } catch {
                print("Failed to enable background delivery for \(type.displayName): \(error)")
            }
        }
    }

    // MARK: - Manual Sync All

    func syncAll() async {
        await syncEngine?.syncAll()
    }

    // MARK: - Reset and Resync Single Type

    func resetAndResync(type: HealthDataType) async {
        await syncEngine?.resetAndResync(type)
    }

    // MARK: - Cleanup

    func stopObservers() {
        for query in observerQueries {
            healthStore.stop(query)
        }
        observerQueries.removeAll()
    }
}
