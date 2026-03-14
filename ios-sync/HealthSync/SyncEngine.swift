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

    /// Called by observers. Fetches pages and uploads inline so the observer
    /// completion handler isn't called until data is actually uploaded.
    /// This keeps iOS from suspending the app during background delivery.
    func markDirty(_ type: HealthDataType) async {
        dirtyBits[type] = true
        guard !syncingTypes.contains(type) else { return }

        syncingTypes.insert(type)
        reportStatus(type, .syncing)

        do {
            let result = try await fetchAndStagePage(type: type)
            if let result {
                await drainLoop(type: type, firstResult: result)
            } else if dirtyBits[type] == true {
                // Observer re-set dirty during the fetch; retry
                dirtyBits[type] = false
                let retry = try await fetchAndStagePage(type: type)
                if let retry {
                    await drainLoop(type: type, firstResult: retry)
                } else {
                    syncingTypes.remove(type)
                    reportStatus(type, .completed(count: 0))
                }
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
                await commitAnchor(from: page, type: type)
                await outboxStore.removePage(page.id)
            }
        }
    }

    // MARK: - Healing Sync

    private let healingDefaults = UserDefaults.standard
    // v2 key forces re-run on devices where v1 marked complete on partial failure
    private let healingRepairKey = "healthsync.healingRepairCompleted.v2"
    private let lastHealingKey = "healthsync.lastHealingSyncAt"
    private let healingThrottleSeconds: TimeInterval = 3 * 3600 // 3 hours

    // Status reporting for UI
    private(set) var lastHealingSyncDate: Date?
    private(set) var lastHealingResult: HealingResult?

    enum HealingResult: Sendable {
        case completed(typeCount: Int)
        case partial(succeeded: [String], failed: [String])
        case throttled
        case running

        var displayString: String {
            switch self {
            case .completed(let types): return "OK (\(types) types)"
            case .partial(let ok, let failed): return "\(ok.count) OK, \(failed.count) failed: \(failed.joined(separator: ", "))"
            case .throttled: return "Throttled (waiting)"
            case .running: return "Running..."
            }
        }

        var isFailure: Bool {
            if case .partial = self { return true }
            return false
        }
    }

    /// Re-uploads recent data using date-bounded sample queries (no anchors).
    /// Idempotent via UUID upsert on server. Runs:
    /// - One-time repair from 2026-02-01 (recovers data lost before fix)
    /// - Rolling 14-day window on subsequent launches (throttled to every 3h)
    func healingSync(force: Bool = false) async {
        let repairDone = healingDefaults.bool(forKey: healingRepairKey)

        if !repairDone {
            let repairStart = DateComponents(calendar: .current, year: 2026, month: 2, day: 1).date!
            print("Healing sync: one-time repair from \(repairStart)")
            let results = await healTypes(from: repairStart)
            let failed = results.filter { !$0.value }.map(\.key.displayName)
            let succeeded = results.filter { $0.value }.map(\.key.displayName)

            if failed.isEmpty {
                healingDefaults.set(true, forKey: healingRepairKey)
                lastHealingResult = .completed(typeCount: succeeded.count)
                print("Healing sync: repair complete for all types")
            } else {
                lastHealingResult = .partial(succeeded: succeeded, failed: failed)
                print("Healing sync: partial repair - failed: \(failed.joined(separator: ", "))")
            }
            lastHealingSyncDate = Date()
            healingDefaults.set(Date().timeIntervalSince1970, forKey: lastHealingKey)
            await refreshMaterializedView()
            return
        }

        // Throttle rolling heal (skip if forced from UI)
        if !force {
            let lastHealing = healingDefaults.double(forKey: lastHealingKey)
            if lastHealing > 0, Date().timeIntervalSince1970 - lastHealing < healingThrottleSeconds {
                lastHealingResult = .throttled
                return
            }
        }

        // Rolling 14-day window
        let windowDays = SyncConfig.healingWindowDays
        let windowStart = Calendar.current.date(byAdding: .day, value: -windowDays, to: Date())!
        print("Healing sync: rolling \(windowDays)-day window")
        let results = await healTypes(from: windowStart)
        let failed = results.filter { !$0.value }.map(\.key.displayName)
        let succeeded = results.filter { $0.value }.map(\.key.displayName)
        if failed.isEmpty {
            lastHealingResult = .completed(typeCount: succeeded.count)
        } else {
            lastHealingResult = .partial(succeeded: succeeded, failed: failed)
        }
        lastHealingSyncDate = Date()
        healingDefaults.set(Date().timeIntervalSince1970, forKey: lastHealingKey)
        await refreshMaterializedView()
    }

    private func healTypes(from startDate: Date) async -> [HealthDataType: Bool] {
        await withTaskGroup(of: (HealthDataType, Bool).self, returning: [HealthDataType: Bool].self) { group in
            for type in HealthDataType.allCases {
                group.addTask { await (type, self.healType(type, from: startDate)) }
            }
            var results: [HealthDataType: Bool] = [:]
            for await (type, success) in group {
                results[type] = success
            }
            return results
        }
    }

    private func healType(_ type: HealthDataType, from startDate: Date) async -> Bool {
        guard let sampleType = type.hkSampleType else { return true }

        let predicate = HKQuery.predicateForSamples(
            withStart: startDate, end: nil, options: .strictStartDate
        )

        do {
            let samples = try await performSampleQuery(
                sampleType: sampleType, predicate: predicate, limit: HKObjectQueryNoLimit
            )
            guard !samples.isEmpty else { return true }

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
                    print("Healing sync: upload failed for \(type.displayName) batch \(uploaded + 1)/\(batches.count)")
                    return false
                }
            }
            if uploaded > 0 {
                print("Healing sync: \(type.displayName) uploaded \(uploaded) batches (\(samples.count) samples)")
            }
            return true
        } catch {
            print("Healing sync error for \(type.displayName): \(error)")
            return false
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
            await commitAnchor(from: firstResult.page, type: type)
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
                    await commitAnchor(from: result.page, type: type)
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

        if totalSynced > 0 {
            // Fire-and-forget: don't hold observer completion handler for this
            Task { await self.refreshMaterializedView() }
        }
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

        // All samples filtered out (e.g., unsynced workout types) - still advance anchor
        if batches.isEmpty {
            await anchorStore.setAnchor(newAnchor, for: type)
            return nil
        }

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

    private func commitAnchor(from page: StagedPage, type: HealthDataType) async {
        guard let anchor = try? NSKeyedUnarchiver.unarchivedObject(
            ofClass: HKQueryAnchor.self, from: page.candidateAnchor
        ) else { return }
        await anchorStore.setAnchor(anchor, for: type)
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

    // MARK: - Materialized View Refresh

    private var lastRefreshTime: Date = .distantPast

    private func refreshMaterializedView() async {
        // Debounce: skip if refreshed within last 10 seconds (prevents stampede from parallel type drains)
        guard Date().timeIntervalSince(lastRefreshTime) > 10 else { return }
        lastRefreshTime = Date()

        guard let url = URL(string: SyncConfig.serverURL.replacingOccurrences(of: "/sync", with: "/sync/refresh")) else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(SyncConfig.apiSecret)", forHTTPHeaderField: "Authorization")
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) {
                print("Materialized view refreshed")
            }
        } catch {
            print("Failed to refresh materialized view: \(error)")
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
