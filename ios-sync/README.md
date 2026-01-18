# HealthSync iOS App

Syncs Apple HealthKit data to your personal server. Part of the health-sync project.

## Features

- **Delta syncing** using HKAnchoredObjectQuery (only new/changed data)
- **Background delivery** via HKObserverQuery (automatic sync on data changes)
- **Supported data types**: Steps, Heart Rate, Workouts
- **Deduplication** via hash-based unique constraints on server

## Setup

### 1. Open in Xcode

```bash
open ios-sync/HealthSync.xcodeproj
```

### 2. Configure Signing

1. Select the project in the navigator
2. Go to "Signing & Capabilities"
3. Select your Team (requires Apple Developer account)
4. Change bundle ID if needed (currently `xyz.namestone.HealthSync`)

### 3. Configure Server URL

Edit `HealthSync/Models.swift`:

```swift
struct SyncConfig {
    static let serverURL = "https://your-server.com/api/sync"  // Change this
    static let apiSecret = "your-secret"  // Change this
    ...
}
```

### 4. Set Server Environment Variable

On your server (where the Next.js dashboard runs):

```bash
export SYNC_API_SECRET="your-secret"
```

### 5. Build and Run

- Connect your iPhone
- Select your device in Xcode
- Press Cmd+R to build and run

## Usage

1. **Grant permissions**: On first launch, tap "Grant Health Access" and approve all requested permissions
2. **Initial backfill**: Tap "Initial Backfill" to sync last 30 days of data
3. **Ongoing sync**: The app will automatically sync new data via background delivery

## Architecture

```
HealthSyncApp.swift     - App entry point
ContentView.swift       - Main UI (status, actions)
HealthKitManager.swift  - HealthKit queries and observers
SyncManager.swift       - HTTP upload queue
AnchorStore.swift       - Persists query anchors (for delta fetching)
Models.swift            - Data models and type conversions
```

### Data Flow

1. **HKObserverQuery** receives "data changed" notification from iOS
2. **HKAnchoredObjectQuery** fetches only new/changed samples since last anchor
3. Samples converted to JSON payload
4. **SyncManager** uploads batch to server
5. Server inserts with `ON CONFLICT DO NOTHING` for deduplication
6. New anchor saved for next delta fetch

## Troubleshooting

### "Health data not available"
- HealthKit only works on real devices, not simulator

### No data syncing
- Check permissions in Settings > Privacy & Security > Health > HealthSync
- Verify server URL is correct and reachable
- Check API secret matches server's SYNC_API_SECRET

### Background sync not working
- iOS limits background execution; may take hours between syncs
- Use "Sync Now" button for manual trigger
- Background delivery is "best effort" per Apple docs

## Adding Sleep Data

Sleep is trickier (per PLAN.md). To enable:

1. Add `.sleepAnalysis` to `typesToSync` array in `HealthKitManager.swift`
2. Rebuild and re-grant permissions

## Files

```
HealthSync.xcodeproj/     - Xcode project
HealthSync/
  HealthSyncApp.swift     - @main entry point
  ContentView.swift       - SwiftUI views
  HealthKitManager.swift  - HealthKit integration
  SyncManager.swift       - Network upload
  AnchorStore.swift       - Anchor persistence
  Models.swift            - Types and conversions
  HealthSync.entitlements - HealthKit + background capabilities
  Assets.xcassets/        - App icons, colors
```
