import SwiftUI

struct ContentView: View {
    @EnvironmentObject var healthKitManager: HealthKitManager
    @EnvironmentObject var syncManager: SyncManager
    @State private var isSyncingManual = false
    @State private var isHealing = false

    /// Display order for data types
    private static let typeOrder: [HealthDataType] = [
        .stepCount, .activeEnergyBurned, .heartRate, .workout,
        .sleepAnalysis, .bodyMass, .vo2Max, .restingHeartRate,
        .heartRateVariabilitySDNN, .walkingHeartRateAverage,
        .sleepingWristTemperature, .heartRateRecovery
    ]

    /// Sorted type statuses for consistent UI order
    private var sortedTypeStatuses: [TypeSyncStatus] {
        ContentView.typeOrder.compactMap { healthKitManager.typeStatuses[$0] }
    }

    /// Most recent sync time across all types
    private var lastSyncTime: Date? {
        healthKitManager.typeStatuses.values
            .compactMap(\.lastSyncTime)
            .max()
    }

    /// Types with errors
    private var errorTypes: [(HealthDataType, String)] {
        healthKitManager.typeStatuses.compactMap { key, val in
            guard let err = val.lastError else { return nil }
            return (key, err)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                // MARK: - Authorization Section (only show if not authorized)
                if !healthKitManager.isAuthorized {
                    Section {
                        Button {
                            Task {
                                await healthKitManager.requestAuthorization()
                            }
                        } label: {
                            Label("Grant Health Access", systemImage: "heart.fill")
                        }

                        if let error = healthKitManager.authorizationError {
                            Text(error)
                                .font(.caption)
                                .foregroundColor(.red)
                        }
                    }
                }

                // MARK: - Sync Status Section
                Section("Sync Status") {
                    HStack {
                        Text("Last Sync")
                        Spacer()
                        if let lastSync = lastSyncTime {
                            Text(lastSync, style: .relative)
                                .foregroundColor(.secondary)
                        } else {
                            Text("Never")
                                .foregroundColor(.secondary)
                        }
                    }

                    if isSyncingManual {
                        HStack {
                            ProgressView()
                                .padding(.trailing, 8)
                            Text("Syncing...")
                        }
                    }

                    // Healing sync status
                    if let healingStatus = healthKitManager.healingStatus {
                        HealingSyncRow(status: healingStatus, isFailure: healthKitManager.healingIsFailure, date: healthKitManager.lastHealingSyncDate)
                    }

                    // Show all errors inline
                    ForEach(errorTypes, id: \.0) { type, error in
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.red)
                                .font(.caption)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(type.displayName)
                                    .font(.caption)
                                    .fontWeight(.medium)
                                Text(error)
                                    .font(.caption2)
                                    .foregroundColor(.red)
                            }
                        }
                    }
                }

                // MARK: - Data Types Section
                Section("Data Types") {
                    ForEach(sortedTypeStatuses, id: \.id) { status in
                        TypeStatusRow(status: status)
                            .swipeActions(edge: .trailing) {
                                Button {
                                    Task {
                                        await healthKitManager.resetAndResync(type: status.type)
                                    }
                                } label: {
                                    Label("Reset", systemImage: "arrow.counterclockwise")
                                }
                                .tint(.orange)
                            }
                    }
                }

                // MARK: - Actions Section
                Section("Actions") {
                    Button {
                        Task {
                            isSyncingManual = true
                            await healthKitManager.syncAll()
                            isSyncingManual = false
                        }
                    } label: {
                        HStack {
                            if isSyncingManual {
                                ProgressView()
                                    .padding(.trailing, 4)
                                Text("Syncing...")
                            } else {
                                Label("Sync All", systemImage: "arrow.triangle.2.circlepath")
                            }
                        }
                    }
                    .disabled(!healthKitManager.isAuthorized || isSyncingManual)

                    Button {
                        Task {
                            isHealing = true
                            healthKitManager.healingStatus = SyncEngine.HealingResult.running.displayString
                            await healthKitManager.runHealingSync()
                            isHealing = false
                        }
                    } label: {
                        HStack {
                            if isHealing {
                                ProgressView()
                                    .padding(.trailing, 4)
                                Text("Healing...")
                            } else {
                                Label("Heal (14-day deep sync)", systemImage: "bandage")
                            }
                        }
                    }
                    .disabled(!healthKitManager.isAuthorized || isHealing)
                }

                // MARK: - Server Config Section
                Section("Server") {
                    HStack {
                        Text("Endpoint")
                        Spacer()
                        Text(SyncConfig.serverURL)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }

                    HStack {
                        Text("Device ID")
                        Spacer()
                        Text(String(SyncConfig.deviceId.prefix(8)) + "...")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    HStack {
                        Text("Version")
                        Spacer()
                        Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("Health Sync")
        }
    }
}

// MARK: - Healing Sync Status Row

struct HealingSyncRow: View {
    let status: String
    let isFailure: Bool
    let date: Date?

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Healing Sync")
                    .font(.subheadline)
                Text(status)
                    .font(.caption)
                    .foregroundColor(isFailure ? .orange : .secondary)
            }
            Spacer()
            if let date {
                Text(date, style: .relative)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }
}

// MARK: - Type Status Row

struct TypeStatusRow: View {
    let status: TypeSyncStatus

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(status.type.displayName)

                    if status.lastError != nil {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundColor(.red)
                            .font(.caption2)
                    }
                }

                HStack(spacing: 8) {
                    if let count = status.lastSyncCount, count > 0 {
                        Text("\(count) synced")
                            .font(.caption)
                            .foregroundColor(.blue)
                    }

                    if let syncTime = status.lastSyncTime {
                        Text(syncTime, style: .relative)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }

            Spacer()

            if status.isAuthorized {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.green)
                    .font(.caption)
            } else {
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(.red)
                    .font(.caption)
            }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(HealthKitManager())
        .environmentObject(SyncManager())
}
