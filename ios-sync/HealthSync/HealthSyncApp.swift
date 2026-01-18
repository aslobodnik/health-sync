import SwiftUI
import HealthKit

@main
struct HealthSyncApp: App {
    @StateObject private var healthKitManager = HealthKitManager()
    @StateObject private var syncManager = SyncManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(healthKitManager)
                .environmentObject(syncManager)
                .task {
                    await healthKitManager.setSyncManager(syncManager)
                    await healthKitManager.initializeIfAuthorized()
                }
        }
    }
}
