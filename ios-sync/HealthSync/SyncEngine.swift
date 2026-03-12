import Foundation
import HealthKit

actor SyncEngine {
    private let healthStore = HKHealthStore()
    private let anchorStore = AnchorStore()
    private let outboxStore = OutboxStore()

    // Dirty-state machine
    private var dirtyBits: [HealthDataType: Bool] = [:]
    private var syncingTypes: Set<HealthDataType> = []

    // Configuration
    private let queryPageSize = 1000
    private let uploadBatchSize = 500
    private let maxRetries = 3

    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    // Status reporting (fire-and-forget to MainActor)
    var onStatusUpdate: (@Sendable @MainActor (HealthDataType, SyncStatus) -> Void)?

    func setOnStatusUpdate(_ callback: @escaping @Sendable @MainActor (HealthDataType, SyncStatus) -> Void) {
        onStatusUpdate = callback
    }

    enum SyncStatus: Sendable {
        case syncing
        case completed(count: Int)
        case error(String)
    }

    // MARK: - Public API

    /// Called by observers. Fetches one page and persists to outbox (crash-safe),
    /// then returns. Upload continues asynchronously.
    func markDirty(_ type: HealthDataType) async {
        dirtyBits[type] = true
        guard !syncingTypes.contains(type) else { return }

        syncingTypes.insert(type)
        reportStatus(type, .syncing)

        do {
            let result = try await fetchAndStagePage(type: type)
            if let result {
                // Upload + drain loop runs async (doesn't block observer)
                Task { await self.drainLoop(type: type, firstResult: result) }
            } else {
                syncingTypes.remove(type)
                reportStatus(type, .completed(count: 0))
            }
        } catch {
            syncingTypes.remove(type)
            reportStatus(type, .error(error.localizedDescription))
        }
    }

    /// Manual sync - marks all types dirty
    func syncAll() async {
        await withTaskGroup(of: Void.self) { group in
            for type in HealthDataType.allCases {
                group.addTask { await self.markDirty(type) }
            }
        }
    }

    /// Clear anchor and re-sync from backfill window
    func resetAndResync(_ type: HealthDataType) async {
        await anchorStore.clearAnchor(for: type)
        await markDirty(type)
    }

    /// Resume incomplete uploads from outbox (crash recovery)
    func resumePendingPages() async {
        let pages = await outboxStore.loadPendingPages()
        for page in pages {
            guard let type = HealthDataType(rawValue: page.type) else {
                await outboxStore.removePage(page.id)
                continue
            }
            if await uploadPage(page) {
                commitAnchor(from: page, type: type)
                await outboxStore.removePage(page.id)
            }
        }
    }

    // MARK: - Healing Sync

    private let healingDefaults = UserDefaults.standard
    private let healingRepairKey = "healthsync.healingRepairCompleted"
    private let lastHealingKey = "healthsync.lastHealingSyncAt"
    private let healingThrottleSeconds: TimeInterval = 6 * 3600 // 6 hours

    /// Re-uploads recent data using date-bounded sample queries (no anchors).
    /// Idempotent via UUID upsert on server. Runs:
    /// - One-time repair from 2026-02-01 (recovers data lost before fix)
    /// - Rolling 7-day window on subsequent launches (throttled to every 6h)
    func healingSync() async {
        let repairDone = healingDefaults.bool(forKey: healingRepairKey)

        if !repairDone {
            // One-time repair: fetch from Feb 1, 2026
            let repairStart = DateComponents(calendar: .current, year: 2026, month: 2, day: 1).date!
            print("Healing sync: one-time repair from \(repairStart)")
            await healTypes(from: repairStart)
            healingDefaults.set(true, forKey: healingRepairKey)
            healingDefaults.set(Date().timeIntervalSince1970, forKey: lastHealingKey)
            return
        }

        // Throttle rolling heal
        let lastHealing = healingDefaults.double(forKey: lastHealingKey)
        if lastHealing > 0, Date().timeIntervalSince1970 - lastHealing < healingThrottleSeconds {
            return
        }

        // Rolling 7-day window
        let windowStart = Calendar.current.date(byAdding: .day, value: -SyncConfig.healingWindowDays, to: Date())!
        print("Healing sync: rolling \(SyncConfig.healingWindowDays)-day window")
        await healTypes(from: windowStart)
        healingDefaults.set(Date().timeIntervalSince1970, forKey: lastHealingKey)
    }

    private func healTypes(from startDate: Date) async {
        await withTaskGroup(of: Void.self) { group in
            for type in HealthDataType.allCases {
                group.addTask { await self.healType(type, from: startDate) }
            }
        }
    }

    private func healType(_ type: HealthDataType, from startDate: Date) async {
        guard let sampleType = type.hkSampleType else { return }

        let predicate = HKQuery.predicateForSamples(
            withStart: startDate, end: nil, options: .strictStartDate
        )

        do {
            let samples = try await performSampleQuery(
                sampleType: sampleType, predicate: predicate, limit: HKObjectQueryNoLimit
            )
            guard !samples.isEmpty else { return }

            let payloads = convertToPayloads(samples: samples, type: type)
            let batches = try buildBatches(
                type: type,
                records: payloads.records,
                workouts: payloads.workouts,
                deletedUUIDs: []
            )

            var uploaded = 0
            for batch in batches {
                if await uploadWithRetry(batch.payload) {
                    uploaded += 1
                } else {
                    print("Healing sync: upload failed for \(type.displayName) batch \(uploaded + 1)")
                    break
                }
            }
            if uploaded > 0 {
                print("Healing sync: \(type.displayName) uploaded \(uploaded) batches (\(samples.count) samples)")
            }
        } catch {
            print("Healing sync error for \(type.displayName): \(error)")
        }
    }

    private func performSampleQuery(
        sampleType: HKSampleType,
        predicate: NSPredicate?,
        limit: Int
    ) async throws -> [HKSample] {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: sampleType,
                predicate: predicate,
                limit: limit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: samples ?? [])
                }
            }
            healthStore.execute(query)
        }
    }

    // MARK: - Drain Loop

    private struct FetchResult {
        let page: StagedPage
        let recordCount: Int
    }

    /// Uploads the first page, then keeps fetching while dirty bit is set
    private func drainLoop(type: HealthDataType, firstResult: FetchResult) async {
        var totalSynced = 0

        // Upload first page (already staged)
        if await uploadPage(firstResult.page) {
            commitAnchor(from: firstResult.page, type: type)
            await outboxStore.removePage(firstResult.page.id)
            totalSynced += firstResult.recordCount

            // Full page means there might be more
            if firstResult.recordCount >= queryPageSize {
                dirtyBits[type] = true
            }
        } else {
            syncingTypes.remove(type)
            reportStatus(type, .error("Upload failed after retries"))
            return
        }

        // Continue while dirty
        while dirtyBits[type] == true {
            dirtyBits[type] = false
            do {
                guard let result = try await fetchAndStagePage(type: type) else { break }
                if await uploadPage(result.page) {
                    commitAnchor(from: result.page, type: type)
                    await outboxStore.removePage(result.page.id)
                    totalSynced += result.recordCount
                    if result.recordCount >= queryPageSize {
                        dirtyBits[type] = true
                    }
                } else {
                    reportStatus(type, .error("Upload failed after retries"))
                    break
                }
            } catch {
                reportStatus(type, .error(error.localizedDescription))
                break
            }
        }

        syncingTypes.remove(type)
        reportStatus(type, .completed(count: totalSynced))
    }

    // MARK: - Fetch and Stage

    private func fetchAndStagePage(type: HealthDataType) async throws -> FetchResult? {
        guard let sampleType = type.hkSampleType else { return nil }

        let anchor = await anchorStore.getAnchor(for: type)

        // On first sync, limit to recent data
        let predicate: NSPredicate? = anchor == nil
            ? HKQuery.predicateForSamples(
                withStart: Calendar.current.date(byAdding: .day, value: -SyncConfig.backfillDays, to: Date()),
                end: nil,
                options: .strictStartDate
            )
            : nil

        let (samples, deletedObjects, newAnchor) = try await performAnchoredQuery(
            sampleType: sampleType,
            anchor: anchor,
            predicate: predicate,
            limit: queryPageSize
        )

        let recordCount = samples.count + deletedObjects.count
        guard recordCount > 0, let newAnchor else { return nil }

        // Convert samples to payloads
        let payloads = convertToPayloads(samples: samples, type: type)
        let deletedUUIDs = deletedObjects.map { $0.uuid.uuidString }

        // Build batches
        let batches = try buildBatches(
            type: type,
            records: payloads.records,
            workouts: payloads.workouts,
            deletedUUIDs: deletedUUIDs
        )

        guard !batches.isEmpty else { return nil }

        // Encode anchors
        let candidateData = try NSKeyedArchiver.archivedData(
            withRootObject: newAnchor, requiringSecureCoding: true
        )
        let baseData: Data? = if let anchor {
            try NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)
        } else {
            nil
        }

        let page = StagedPage(
            id: UUID(),
            type: type.rawValue,
            baseAnchor: baseData,
            candidateAnchor: candidateData,
            batches: batches,
            attemptCount: 0,
            createdAt: Date()
        )

        try await outboxStore.savePage(page)
        return FetchResult(page: page, recordCount: recordCount)
    }

    // MARK: - Payload Conversion

    private struct PayloadResult {
        let records: [HealthRecordPayload]
        let workouts: [WorkoutPayload]
    }

    private func convertToPayloads(samples: [HKSample], type: HealthDataType) -> PayloadResult {
        switch type {
        case .stepCount, .heartRate, .activeEnergyBurned, .bodyMass, .vo2Max,
             .restingHeartRate, .heartRateVariabilitySDNN, .walkingHeartRateAverage,
             .sleepingWristTemperature, .heartRateRecovery:
            let records = samples.compactMap { ($0 as? HKQuantitySample)?.toPayload() }
            return PayloadResult(records: records, workouts: [])
        case .sleepAnalysis:
            let records = samples.compactMap { ($0 as? HKCategorySample)?.toPayload() }
            return PayloadResult(records: records, workouts: [])
        case .workout:
            let workouts = samples.compactMap { sample -> WorkoutPayload? in
                guard let workout = sample as? HKWorkout, workout.shouldSync else { return nil }
                return workout.toPayload()
            }
            return PayloadResult(records: [], workouts: workouts)
        }
    }

    // MARK: - Batch Building

    private func buildBatches(
        type: HealthDataType,
        records: [HealthRecordPayload],
        workouts: [WorkoutPayload],
        deletedUUIDs: [String]
    ) throws -> [StagedBatch] {
        var batches: [StagedBatch] = []

        for i in stride(from: 0, to: max(records.count, 1), by: uploadBatchSize) where !records.isEmpty {
            let end = min(i + uploadBatchSize, records.count)
            let chunk = Array(records[i..<end])
            let syncBatch = SyncBatch(
                dataType: type.rawValue,
                records: chunk,
                workouts: nil,
                deletedUUIDs: batches.isEmpty ? deletedUUIDs : [],
                deviceId: SyncConfig.deviceId,
                timestamp: Date()
            )
            let data = try encoder.encode(syncBatch)
            batches.append(StagedBatch(id: UUID(), payload: data, status: .pending))
        }

        for i in stride(from: 0, to: max(workouts.count, 1), by: uploadBatchSize) where !workouts.isEmpty {
            let end = min(i + uploadBatchSize, workouts.count)
            let chunk = Array(workouts[i..<end])
            let syncBatch = SyncBatch(
                dataType: type.rawValue,
                records: nil,
                workouts: chunk,
                deletedUUIDs: batches.isEmpty ? deletedUUIDs : [],
                deviceId: SyncConfig.deviceId,
                timestamp: Date()
            )
            let data = try encoder.encode(syncBatch)
            batches.append(StagedBatch(id: UUID(), payload: data, status: .pending))
        }

        // Delete-only batch if no records or workouts
        if batches.isEmpty && !deletedUUIDs.isEmpty {
            let syncBatch = SyncBatch(
                dataType: type.rawValue,
                records: nil,
                workouts: nil,
                deletedUUIDs: deletedUUIDs,
                deviceId: SyncConfig.deviceId,
                timestamp: Date()
            )
            let data = try encoder.encode(syncBatch)
            batches.append(StagedBatch(id: UUID(), payload: data, status: .pending))
        }

        return batches
    }

    // MARK: - Upload

    /// Upload all pending batches in a page sequentially. Returns true if all succeed.
    private func uploadPage(_ page: StagedPage) async -> Bool {
        for batch in page.batches where batch.status != .succeeded {
            try? await outboxStore.updateBatchStatus(
                pageId: page.id, batchId: batch.id, status: .uploading
            )

            if await uploadWithRetry(batch.payload) {
                try? await outboxStore.updateBatchStatus(
                    pageId: page.id, batchId: batch.id, status: .succeeded
                )
            } else {
                try? await outboxStore.updateBatchStatus(
                    pageId: page.id, batchId: batch.id, status: .failed
                )
                return false
            }
        }
        return true
    }

    private func uploadWithRetry(_ payload: Data) async -> Bool {
        for attempt in 0..<maxRetries {
            do {
                try await upload(payload)
                return true
            } catch {
                let transient = isTransientError(error)
                if !transient || attempt == maxRetries - 1 { return false }
                let delay = Double(1 << attempt) + Double.random(in: 0...1)
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
        }
        return false
    }

    private func upload(_ payload: Data) async throws {
        guard let url = URL(string: SyncConfig.serverURL) else {
            throw UploadError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(SyncConfig.apiSecret)", forHTTPHeaderField: "Authorization")
        request.httpBody = payload

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse else {
            throw UploadError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw UploadError.serverError(statusCode: http.statusCode, message: msg)
        }
    }

    private func isTransientError(_ error: Error) -> Bool {
        if let e = error as? UploadError, case .serverError(let code, _) = e {
            return code == 429 || (500...599).contains(code)
        }
        return (error as NSError).domain == NSURLErrorDomain
    }

    // MARK: - Anchor Management

    private func commitAnchor(from page: StagedPage, type: HealthDataType) {
        guard let anchor = try? NSKeyedUnarchiver.unarchivedObject(
            ofClass: HKQueryAnchor.self, from: page.candidateAnchor
        ) else { return }
        Task { await anchorStore.setAnchor(anchor, for: type) }
    }

    // MARK: - HealthKit Query

    private func performAnchoredQuery(
        sampleType: HKSampleType,
        anchor: HKQueryAnchor?,
        predicate: NSPredicate?,
        limit: Int
    ) async throws -> ([HKSample], [HKDeletedObject], HKQueryAnchor?) {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(
                type: sampleType,
                predicate: predicate,
                anchor: anchor,
                limit: limit
            ) { _, samples, deletedObjects, newAnchor, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: (samples ?? [], deletedObjects ?? [], newAnchor))
                }
            }
            healthStore.execute(query)
        }
    }

    // MARK: - Status Reporting

    private func reportStatus(_ type: HealthDataType, _ status: SyncStatus) {
        let callback = onStatusUpdate
        Task { @MainActor in callback?(type, status) }
    }

    // MARK: - Errors

    enum UploadError: LocalizedError {
        case invalidURL
        case invalidResponse
        case serverError(statusCode: Int, message: String)

        var errorDescription: String? {
            switch self {
            case .invalidURL: return "Invalid server URL"
            case .invalidResponse: return "Invalid server response"
            case .serverError(let code, let msg): return "Server error (\(code)): \(msg)"
            }
        }
    }
}
