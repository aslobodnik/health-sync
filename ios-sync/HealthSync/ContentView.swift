import SwiftUI

struct ContentView: View {
    @EnvironmentObject var healthKitManager: HealthKitManager
    @EnvironmentObject var syncManager: SyncManager
    @State private var isBackfilling = false

    /// Display order for data types
    private static let typeOrder: [HealthDataType] = [
        .stepCount, .activeEnergyBurned, .heartRate, .workout,
        .sleepAnalysis, .bodyMass, .vo2Max
    ]

    /// Sorted type statuses for consistent UI order
    private var sortedTypeStatuses: [TypeSyncStatus] {
        ContentView.typeOrder.compactMap { healthKitManager.typeStatuses[$0] }
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
                        if let lastSync = syncManager.lastSyncTime {
                            Text(lastSync, style: .relative)
                                .foregroundColor(.secondary)
                        } else {
                            Text("Never")
                                .foregroundColor(.secondary)
                        }
                    }

                    if syncManager.isSyncing {
                        HStack {
                            ProgressView()
                                .padding(.trailing, 8)
                            Text("Syncing...")
                        }
                    }

                    if syncManager.pendingBatches > 0 {
                        HStack {
                            Text("Pending")
                            Spacer()
                            Text("\(syncManager.pendingBatches) batches")
                                .foregroundColor(.orange)
                        }
                    }

                    if let error = syncManager.lastError {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.red)
                            Text(error)
                                .font(.caption)
                                .foregroundColor(.red)
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
                            await healthKitManager.syncAll()
                        }
                    } label: {
                        Label("Sync Now", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .disabled(!healthKitManager.isAuthorized || syncManager.isSyncing)

                    Button {
                        Task {
                            isBackfilling = true
                            await healthKitManager.performBackfill()
                            isBackfilling = false
                        }
                    } label: {
                        if isBackfilling {
                            HStack {
                                ProgressView()
                                    .padding(.trailing, 8)
                                Text("Backfilling...")
                            }
                        } else {
                            Label("Initial Backfill (\(SyncConfig.backfillDays) days)", systemImage: "clock.arrow.circlepath")
                        }
                    }
                    .disabled(!healthKitManager.isAuthorized || isBackfilling)
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
                }
            }
            .navigationTitle("Health Sync")
        }
    }
}

struct TypeStatusRow: View {
    let status: TypeSyncStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(status.type.displayName)
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

            if let lastSync = status.lastSyncTime {
                Text("Last sync: \(lastSync, style: .relative)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if let error = status.lastError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(HealthKitManager())
        .environmentObject(SyncManager())
}
