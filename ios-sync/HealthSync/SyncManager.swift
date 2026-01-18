import Foundation
import Combine

@MainActor
class SyncManager: ObservableObject {
    @Published var isSyncing = false
    @Published var lastSyncTime: Date?
    @Published var lastError: String?
    @Published var pendingBatches: Int = 0

    private let anchorStore = AnchorStore()
    private var uploadQueue: [SyncBatch] = []
    private var isProcessingQueue = false

    private lazy var backgroundSession: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: "xyz.namestone.HealthSync.background")
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        return URLSession(configuration: config, delegate: nil, delegateQueue: nil)
    }()

    private lazy var encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    // MARK: - Queue Management

    func queueBatch(_ batch: SyncBatch, for type: HealthDataType) async {
        uploadQueue.append(batch)
        pendingBatches = uploadQueue.count

        if !isProcessingQueue {
            await processQueue()
        }
    }

    private func processQueue() async {
        guard !isProcessingQueue else { return }
        isProcessingQueue = true
        isSyncing = true

        while !uploadQueue.isEmpty {
            let batch = uploadQueue.removeFirst()
            pendingBatches = uploadQueue.count

            do {
                try await uploadBatch(batch)

                // Update last sync time for the type
                if let type = HealthDataType(rawValue: batch.dataType) {
                    await anchorStore.setLastSyncTime(Date(), for: type)
                }

                lastSyncTime = Date()
                lastError = nil

            } catch {
                print("Upload failed: \(error)")
                lastError = error.localizedDescription

                // Re-queue failed batch (with limit to prevent infinite retries)
                // For now, just log and continue
            }
        }

        isProcessingQueue = false
        isSyncing = false

        // Refresh materialized view after all syncs complete
        await refreshMaterializedView()
    }

    // MARK: - Refresh Materialized View

    private func refreshMaterializedView() async {
        guard let url = URL(string: SyncConfig.refreshURL) else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(SyncConfig.apiSecret)", forHTTPHeaderField: "Authorization")

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) {
                print("Materialized view refreshed")
            }
        } catch {
            print("Failed to refresh materialized view: \(error)")
        }
    }

    // MARK: - Upload

    private func uploadBatch(_ batch: SyncBatch) async throws {
        guard let url = URL(string: SyncConfig.serverURL) else {
            throw SyncError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(SyncConfig.apiSecret)", forHTTPHeaderField: "Authorization")

        let body = try encoder.encode(batch)
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw SyncError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw SyncError.serverError(statusCode: httpResponse.statusCode, message: message)
        }

        let recordCount = (batch.records?.count ?? 0) + (batch.workouts?.count ?? 0)
        print("Uploaded \(recordCount) records for \(batch.dataType)")
    }

    // MARK: - Background Upload (for future use)

    func uploadBatchInBackground(_ batch: SyncBatch) async throws {
        guard let url = URL(string: SyncConfig.serverURL) else {
            throw SyncError.invalidURL
        }

        // Write batch to temp file for background upload
        let tempDir = FileManager.default.temporaryDirectory
        let fileName = "batch_\(UUID().uuidString).json"
        let fileURL = tempDir.appendingPathComponent(fileName)

        let body = try encoder.encode(batch)
        try body.write(to: fileURL)

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(SyncConfig.apiSecret)", forHTTPHeaderField: "Authorization")

        let task = backgroundSession.uploadTask(with: request, fromFile: fileURL)
        task.resume()
    }

    // MARK: - Status

    func getLastSyncTime(for type: HealthDataType) async -> Date? {
        await anchorStore.getLastSyncTime(for: type)
    }
}

// MARK: - Errors

enum SyncError: LocalizedError {
    case invalidURL
    case invalidResponse
    case serverError(statusCode: Int, message: String)
    case encodingError

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid server URL"
        case .invalidResponse:
            return "Invalid server response"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        case .encodingError:
            return "Failed to encode data"
        }
    }
}
