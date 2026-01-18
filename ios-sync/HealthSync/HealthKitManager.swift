import Foundation
import HealthKit
import Combine

@MainActor
class HealthKitManager: ObservableObject {
    private let healthStore = HKHealthStore()
    private let anchorStore = AnchorStore()
    private var syncManager: SyncManager?
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

    func setSyncManager(_ manager: SyncManager) async {
        self.syncManager = manager
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
                        await self?.fetchAndSync(type: type)
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

    // MARK: - Anchored Object Queries (Delta Fetching)

    func fetchAndSync(type: HealthDataType) async {
        guard let sampleType = type.hkSampleType else { return }

        let anchor = await anchorStore.getAnchor(for: type)

        // On first sync (no anchor), limit to recent data to avoid millions of historical records
        let predicate: NSPredicate? = anchor == nil
            ? HKQuery.predicateForSamples(
                withStart: Calendar.current.date(byAdding: .day, value: -SyncConfig.backfillDays, to: Date()),
                end: nil,
                options: .strictStartDate
            )
            : nil

        do {
            let (samples, deletedObjects, newAnchor) = try await performAnchoredQuery(
                sampleType: sampleType,
                anchor: anchor,
                predicate: predicate
            )

            if !samples.isEmpty || !deletedObjects.isEmpty {
                print("\(type.displayName): \(samples.count) new/updated, \(deletedObjects.count) deleted")

                // Convert to payloads and sync
                await syncData(type: type, samples: samples, deletedUUIDs: deletedObjects.map { $0.uuid.uuidString })
            }

            // Save new anchor
            if let newAnchor = newAnchor {
                await anchorStore.setAnchor(newAnchor, for: type)
            }

            // Update status
            typeStatuses[type]?.lastError = nil

        } catch {
            print("Anchored query failed for \(type.displayName): \(error)")
            typeStatuses[type]?.lastError = error.localizedDescription
        }
    }

    private func performAnchoredQuery(
        sampleType: HKSampleType,
        anchor: HKQueryAnchor?,
        predicate: NSPredicate? = nil
    ) async throws -> ([HKSample], [HKDeletedObject], HKQueryAnchor?) {

        try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(
                type: sampleType,
                predicate: predicate,
                anchor: anchor,
                limit: HKObjectQueryNoLimit
            ) { _, samples, deletedObjects, newAnchor, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: (samples ?? [], deletedObjects ?? [], newAnchor))
                }
            }

            healthStore.execute(query)
        }
    }

    // MARK: - Sync Data

    private func syncData(type: HealthDataType, samples: [HKSample], deletedUUIDs: [String]) async {
        guard let syncManager = syncManager else { return }

        var allRecords: [HealthRecordPayload] = []
        var allWorkouts: [WorkoutPayload] = []

        switch type {
        case .stepCount, .heartRate, .activeEnergyBurned, .bodyMass, .vo2Max:
            allRecords = samples.compactMap { ($0 as? HKQuantitySample)?.toPayload() }
        case .sleepAnalysis:
            allRecords = samples.compactMap { ($0 as? HKCategorySample)?.toPayload() }
        case .workout:
            allWorkouts = samples.compactMap { sample -> WorkoutPayload? in
                guard let workout = sample as? HKWorkout, workout.shouldSync else { return nil }
                return workout.toPayload()
            }
        }

        // Chunk records into batches to avoid payload size limits
        let batchSize = SyncConfig.batchSize

        if !allRecords.isEmpty {
            for i in stride(from: 0, to: allRecords.count, by: batchSize) {
                let end = min(i + batchSize, allRecords.count)
                let chunk = Array(allRecords[i..<end])
                let batch = SyncBatch(
                    dataType: type.rawValue,
                    records: chunk,
                    workouts: nil,
                    deletedUUIDs: i == 0 ? deletedUUIDs : [],
                    deviceId: SyncConfig.deviceId,
                    timestamp: Date()
                )
                await syncManager.queueBatch(batch, for: type)
            }
        } else if !allWorkouts.isEmpty {
            for i in stride(from: 0, to: allWorkouts.count, by: batchSize) {
                let end = min(i + batchSize, allWorkouts.count)
                let chunk = Array(allWorkouts[i..<end])
                let batch = SyncBatch(
                    dataType: type.rawValue,
                    records: nil,
                    workouts: chunk,
                    deletedUUIDs: i == 0 ? deletedUUIDs : [],
                    deviceId: SyncConfig.deviceId,
                    timestamp: Date()
                )
                await syncManager.queueBatch(batch, for: type)
            }
        } else if !deletedUUIDs.isEmpty {
            let batch = SyncBatch(
                dataType: type.rawValue,
                records: nil,
                workouts: nil,
                deletedUUIDs: deletedUUIDs,
                deviceId: SyncConfig.deviceId,
                timestamp: Date()
            )
            await syncManager.queueBatch(batch, for: type)
        }
    }

    // MARK: - Manual Sync All

    func syncAll() async {
        for type in typesToSync {
            await fetchAndSync(type: type)
        }
    }

    // MARK: - Reset and Resync Single Type

    func resetAndResync(type: HealthDataType) async {
        guard let sampleType = type.hkSampleType else { return }

        print("Resetting anchor for \(type.displayName)")
        await anchorStore.clearAnchor(for: type)

        // Query with backfill window (no anchor = fresh start)
        let startDate = Calendar.current.date(byAdding: .day, value: -SyncConfig.backfillDays, to: Date()) ?? Date()
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: nil, options: .strictStartDate)

        do {
            let (samples, deletedObjects, newAnchor) = try await performAnchoredQuery(
                sampleType: sampleType,
                anchor: nil,
                predicate: predicate
            )

            print("\(type.displayName) reset: \(samples.count) samples found")

            if !samples.isEmpty || !deletedObjects.isEmpty {
                await syncData(type: type, samples: samples, deletedUUIDs: deletedObjects.map { $0.uuid.uuidString })
            }

            if let newAnchor = newAnchor {
                await anchorStore.setAnchor(newAnchor, for: type)
            }

            typeStatuses[type]?.lastError = nil

        } catch {
            print("Reset sync failed for \(type.displayName): \(error)")
            typeStatuses[type]?.lastError = error.localizedDescription
        }
    }

    // MARK: - Initial Backfill

    func performBackfill() async {
        let startDate = Calendar.current.date(byAdding: .day, value: -SyncConfig.backfillDays, to: Date()) ?? Date()

        for type in typesToSync {
            guard let sampleType = type.hkSampleType else { continue }

            print("Starting backfill for \(type.displayName) from \(startDate)")

            do {
                let samples = try await queryHistoricalData(sampleType: sampleType, startDate: startDate)
                print("Backfill found \(samples.count) \(type.displayName) samples")

                if !samples.isEmpty {
                    await syncData(type: type, samples: samples, deletedUUIDs: [])
                }
            } catch {
                print("Backfill failed for \(type.displayName): \(error)")
                typeStatuses[type]?.lastError = "Backfill failed: \(error.localizedDescription)"
            }
        }
    }

    private func queryHistoricalData(sampleType: HKSampleType, startDate: Date) async throws -> [HKSample] {
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: Date(), options: .strictStartDate)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: sampleType,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
            ) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: samples ?? [])
                }
            }

            healthStore.execute(query)
        }
    }

    // MARK: - Cleanup

    func stopObservers() {
        for query in observerQueries {
            healthStore.stop(query)
        }
        observerQueries.removeAll()
    }
}
