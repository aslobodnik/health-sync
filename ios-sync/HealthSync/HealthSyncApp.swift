import SwiftUI

@main
struct HealthSyncApp: App {
    @StateObject private var healthKitManager = HealthKitManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(healthKitManager)
                .task {
                    let engine = SyncEngine()

                    // Wire status updates from SyncEngine to HealthKitManager
                    let hkm = healthKitManager
                    await engine.setOnStatusUpdate { type, status in
                        switch status {
                        case .syncing:
                            hkm.typeStatuses[type]?.lastError = nil
                        case .completed(let count):
                            hkm.typeStatuses[type]?.lastSyncTime = Date()
                            hkm.typeStatuses[type]?.lastSyncCount = count
                            hkm.typeStatuses[type]?.lastError = nil
                        case .error(let message):
                            hkm.typeStatuses[type]?.lastError = message
                        }
                    }

                    await healthKitManager.setSyncEngine(engine)
                    await engine.resumePendingPages()
                    await healthKitManager.initializeIfAuthorized()

                    // Healing sync: recovers data lost before the drain loop fix
                    hkm.healingStatus = SyncEngine.HealingResult.running.displayString
                    await engine.healingSync()
                    await hkm.updateHealingStatus(from: engine)
                }
        }
    }
}
