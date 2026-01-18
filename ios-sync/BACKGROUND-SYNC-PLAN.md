# Plan: iOS HealthKit Background Sync

## Goal
Make the HealthSync iOS app properly sync health data in the background every ~1-2 hours (Apple's throttled delivery rate) without requiring the user to open the app.

## Current Issues

1. **Missing UIBackgroundModes** - App has HealthKit background delivery entitlement but no background modes capability
2. **No AppDelegate** - SwiftUI app can't handle background launches or background URLSession events
3. **Late observer setup** - Observers only registered after user authorization, not on every app launch
4. **Foreground-only uploads** - Uses `URLSession.shared` instead of background URLSession for uploads
5. **Completion handler timing** - HKObserverQuery completion handler called inside async Task (should use defer)

## Implementation Steps

### Step 1: Add UIBackgroundModes capability

**File:** Xcode project settings (or Info.plist)

Add Background Modes capability with "Background processing" enabled. This adds:
```xml
<key>UIBackgroundModes</key>
<array>
    <string>processing</string>
</array>
```

In Xcode: Target > Signing & Capabilities > + Capability > Background Modes > check "Background processing"

---

### Step 2: Create AppDelegate with UIApplicationDelegateAdaptor

**File:** `ios-sync/HealthSync/AppDelegate.swift` (new file)

```swift
import UIKit
import HealthKit

class AppDelegate: NSObject, UIApplicationDelegate {
    // Store background URLSession completion handler
    var backgroundCompletionHandler: (() -> Void)?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Register HealthKit observers on EVERY launch (background or foreground)
        Task {
            await HealthKitManager.shared.setupBackgroundObservers()
        }
        return true
    }

    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        // Store completion handler - will be called when background uploads finish
        backgroundCompletionHandler = completionHandler

        // Reconnect to background session to receive delegate events
        _ = SyncManager.shared.reconnectBackgroundSession()
    }
}
```

---

### Step 3: Update HealthSyncApp to use AppDelegate

**File:** `ios-sync/HealthSync/HealthSyncApp.swift`

```swift
@main
struct HealthSyncApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var healthKitManager = HealthKitManager.shared
    @StateObject private var syncManager = SyncManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(healthKitManager)
                .environmentObject(syncManager)
        }
    }
}
```

---

### Step 4: Refactor HealthKitManager to singleton with early setup

**File:** `ios-sync/HealthSync/HealthKitManager.swift`

Changes:
1. Convert to singleton (`static let shared`)
2. Add `setupBackgroundObservers()` method for AppDelegate to call on launch
3. Separate authorization flow from observer registration
4. Fix completion handler to use `defer` pattern

Key changes:
```swift
@MainActor
class HealthKitManager: ObservableObject {
    static let shared = HealthKitManager()

    // Called by AppDelegate on EVERY app launch
    func setupBackgroundObservers() async {
        // Only set up if we have authorization (check without prompting)
        for type in typesToSync {
            guard let sampleType = type.hkSampleType else { continue }

            // Check if already authorized (doesn't prompt user)
            let status = healthStore.authorizationStatus(for: sampleType)
            guard status == .sharingAuthorized else { continue }

            // Register observer
            let query = HKObserverQuery(sampleType: sampleType, predicate: nil) { [weak self] _, completionHandler, error in
                defer { completionHandler() } // ALWAYS call completion handler

                guard error == nil else { return }

                Task { @MainActor [weak self] in
                    await self?.fetchAndSync(type: type)
                }
            }

            healthStore.execute(query)
            observerQueries.append(query)

            // Enable background delivery on EVERY launch
            do {
                try await healthStore.enableBackgroundDelivery(for: sampleType, frequency: .immediate)
            } catch {
                print("Background delivery failed for \(type.displayName): \(error)")
            }
        }
    }
}
```

---

### Step 5: Refactor SyncManager for background uploads

**File:** `ios-sync/HealthSync/SyncManager.swift`

Changes:
1. Convert to singleton (`static let shared`)
2. Implement `URLSessionDelegate` for background session events
3. Use background session for all uploads (not just future use)
4. Add method to reconnect to existing background session on app launch

Key additions:
```swift
@MainActor
class SyncManager: NSObject, ObservableObject, URLSessionDelegate, URLSessionDataDelegate {
    static let shared = SyncManager()

    private var backgroundCompletionHandler: (() -> Void)?

    func reconnectBackgroundSession() -> URLSession {
        // Recreate session with same identifier to receive pending events
        return backgroundSession
    }

    // URLSessionDelegate - called when all background events delivered
    nonisolated func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        Task { @MainActor in
            // Call the completion handler stored by AppDelegate
            if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
                appDelegate.backgroundCompletionHandler?()
                appDelegate.backgroundCompletionHandler = nil
            }
        }
    }

    // URLSessionDataDelegate - handle upload responses
    nonisolated func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        // Process server response
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        // Handle completion/error
    }
}
```

Update `backgroundSession` to use delegate:
```swift
private lazy var backgroundSession: URLSession = {
    let config = URLSessionConfiguration.background(withIdentifier: "xyz.namestone.HealthSync.background")
    config.isDiscretionary = false
    config.sessionSendsLaunchEvents = true
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
}()
```

---

### Step 6: Switch uploads to background session

**File:** `ios-sync/HealthSync/SyncManager.swift`

Replace `URLSession.shared.data(for: request)` with background upload task:

```swift
private func uploadBatch(_ batch: SyncBatch) async throws {
    // Write to temp file (required for background uploads)
    let tempDir = FileManager.default.temporaryDirectory
    let fileURL = tempDir.appendingPathComponent("batch_\(UUID().uuidString).json")
    let body = try encoder.encode(batch)
    try body.write(to: fileURL)

    var request = URLRequest(url: URL(string: SyncConfig.serverURL)!)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(SyncConfig.apiSecret)", forHTTPHeaderField: "Authorization")

    let task = backgroundSession.uploadTask(with: request, fromFile: fileURL)
    task.resume()

    // Note: Response handled by URLSessionDelegate methods, not returned here
}
```

---

## Files to Modify

| File | Action |
|------|--------|
| `ios-sync/HealthSync/AppDelegate.swift` | Create new |
| `ios-sync/HealthSync/HealthSyncApp.swift` | Add AppDelegate adaptor, use singletons |
| `ios-sync/HealthSync/HealthKitManager.swift` | Singleton, early observer setup, fix completion handler |
| `ios-sync/HealthSync/SyncManager.swift` | Singleton, URLSessionDelegate, background uploads |
| Xcode project | Add UIBackgroundModes capability |

---

## Verification

1. **Build and run** on device (background delivery doesn't work in simulator)

2. **Test foreground sync** - Open app, verify manual sync still works

3. **Test background delivery:**
   - Open app, grant permissions, close app
   - Do a workout or wait for heart rate data from Apple Watch
   - Check database for new records without opening app
   - Check Console.app for "Observer triggered" and "Background delivery enabled" logs

4. **Test app termination recovery:**
   - Force quit the app
   - Generate new health data
   - App should be woken by HealthKit and sync

5. **Verify completion handlers:**
   - Check Console.app for any warnings about completion handlers not being called
   - System will log if background tasks exceed time limits

---

## Notes

- Apple throttles background delivery to roughly every 1-2 hours
- Background delivery may be delayed based on battery state, Low Power Mode, system load
- The app must be launched at least once after install for background delivery to work
- User must grant HealthKit permissions before background sync can function
