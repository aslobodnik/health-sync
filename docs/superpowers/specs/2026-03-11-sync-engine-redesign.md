# Sync Engine Redesign

**Date:** 2026-03-11
**Status:** Approved
**Scope:** iOS app sync architecture + server schema changes
**Reviewed by:** Codex (2 passes)

## Problem

Confirmed data loss bug: when a batch upload fails in `SyncManager.processQueue`, the batch is silently dropped but the HealthKit anchor still advances in `fetchAndSync`. Records are permanently lost. The healing sync safety net (date-bounded re-fetch) was removed from app launch and manual sync on Feb 15, 2026.

Secondary issues:
- Everything runs on `@MainActor` (no real parallelism, blocks UI during sync)
- Observer completion handler blocks until full upload completes (risks HealthKit throttling)
- `HKObjectQueryNoLimit` loads unbounded data into memory
- No `HKSample.uuid` in payloads (unsafe retry/healing)
- Dead code: background URLSession, unused methods

## Design

### Architecture

```
Observer → HealthKitManager (@MainActor, thin: auth + observers + UI state)
                ↓ mark type dirty
           SyncEngine (actor, off main thread)
                ↓ fetch page (1000 samples)
           OutboxStore (actor, persist to disk)
                ↓ staged page saved, completionHandler called
                ↓ upload batches sequentially
           Anchor committed only after ALL batches in page succeed
```

### New: `actor SyncEngine`

Owns the entire fetch → stage → upload → commit pipeline. Replaces `SyncManager`.

Responsibilities:
- Receives "type dirty" signals from HealthKitManager
- Maintains a sticky dirty bit per type: if data arrives while a type is syncing, the bit stays set and triggers a second pass after the current sync completes
- Fetches HealthKit data in pages of 1,000 samples via `HKAnchoredObjectQuery`
- Converts samples to payloads (off MainActor)
- Persists work to OutboxStore before any network call
- Uploads batches sequentially per page (concurrent uploads don't help against single Vercel function doing row-by-row inserts)
- Advances anchor only after all batches in a page succeed
- Retries transient failures with exponential backoff + jitter (max 3 attempts)
- Surfaces permanent failures (4xx) as errors without advancing anchor
- Runs healing sync on launch after normal sync completes

Parameters:
- `queryPageSize = 1000` (HealthKit fetch, memory bound -- for typical 50-100 record syncs this is one page)
- `uploadBatchSize = 500` (HTTP payload)

### Dirty-State Machine

```
Per type: idle → syncing → (check dirty bit) → idle or re-sync

markDirty(type):
  set dirtyBit[type] = true
  if state[type] == idle: start sync for type

syncLoop(type):
  state[type] = syncing
  while dirtyBit[type]:
    dirtyBit[type] = false
    fetch page → stage → upload → commit anchor
  state[type] = idle
```

This ensures data arriving during an active sync is never dropped. The existing `syncingTypes` guard is replaced by this state machine.

### New: `actor OutboxStore`

Durable persistence for pending upload work. Prevents data loss on crash or upload failure.

```swift
struct StagedPage: Codable {
    let id: UUID
    let type: String                // HealthDataType.rawValue
    let baseAnchor: Data?           // anchor before this page
    let candidateAnchor: Data       // anchor after this page (not yet committed)
    let batches: [StagedBatch]
    var attemptCount: Int
    let createdAt: Date
}

struct StagedBatch: Codable {
    let id: UUID
    let payload: Data               // pre-encoded JSON
    var status: BatchStatus         // pending, uploading, succeeded, failed
}

enum BatchStatus: String, Codable {
    case pending, uploading, succeeded, failed
}
```

Storage: JSON files in app's documents directory (`OutboxStore/pages/`).

On app launch, SyncEngine checks outbox for incomplete pages and resumes upload.

### Changed: `HealthKitManager` (slimmed)

Stays `@MainActor`. Reduced responsibilities:
- Authorization and permission checking
- Observer setup: on notification, calls `await syncEngine.markDirty(type)` then `completionHandler()` -- markDirty fetches and persists one page to outbox before returning, so data is crash-safe before we ack the observer
- Publishing `@Published` status properties for UI binding
- Triggering reset/resync for individual types

Removed from HealthKitManager (moved to SyncEngine):
- `syncData()` -- sample conversion and batching
- `performAnchoredQuery()` / `performSampleQuery()` -- HealthKit queries
- `healingSync()` -- gap repair
- All anchor read/write calls

### Changed: `AnchorStore` (minor)

Remains an actor. No structural changes, but anchor writes now happen exclusively through SyncEngine after confirmed upload success, never directly from HealthKitManager.

### Observer Flow (changed)

Current (blocks on full upload):
```
Observer fires → fetchAndSync() → upload all batches → completionHandler()
```

New (fetch + persist, then upload async):
```
Observer fires → syncEngine.markDirty(type)
  → fetch one page from HealthKit
  → persist to OutboxStore (crash-safe)
  → return (completionHandler called)
  → upload continues asynchronously
```

Key: `completionHandler()` is called after data is persisted locally, but before upload. This prevents HealthKit throttling while ensuring no data loss on crash.

### Retry Logic

- Transient failures (network errors, HTTP 429, 5xx): retry with exponential backoff + jitter, max 3 attempts per batch
- Permanent failures (HTTP 4xx except 429): mark batch as failed, surface error in UI, do NOT advance anchor
- On app launch: resume any incomplete pages from outbox (crash recovery)

### Healing Sync

- Runs on app launch after normal anchored sync completes
- 7-day rolling window using date-bounded `HKSampleQuery` (not anchored)
- One-time repair pass with explicit start date of 2026-02-01 (not relative -- covers full gap since healing sync was removed)
- Uses the same SyncEngine upload path (idempotent via UUID-based upsert)
- Never reads or writes anchored cursors
- Tracked via `lastHealingSyncAt` timestamp in UserDefaults
- Low priority: runs after all anchored syncs finish

### Server Changes

**Schema migration:**
```sql
-- Add sample UUID columns
ALTER TABLE health_raw ADD COLUMN sample_uuid TEXT;
ALTER TABLE workouts ADD COLUMN sample_uuid TEXT;

-- Create unique indexes for upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_raw_sample_uuid
  ON health_raw (sample_uuid) WHERE sample_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workouts_sample_uuid
  ON workouts (sample_uuid) WHERE sample_uuid IS NOT NULL;

-- Keep record_hash and workout_hash constraints for backward compat with existing data
```

**Sync endpoint (`POST /api/sync`):**
- Accept `sampleUUID` field in `HealthRecordPayload` and `WorkoutPayload`
- Health records: when `sampleUUID` present, `INSERT ... ON CONFLICT (sample_uuid) DO UPDATE SET ...`; when absent, fall back to `ON CONFLICT (record_hash) DO NOTHING`
- Workouts: when `sampleUUID` present, `INSERT ... ON CONFLICT (sample_uuid) DO UPDATE SET ...`; when absent, fall back to `ON CONFLICT (workout_hash) DO NOTHING`
- Delete handling: match by `sample_uuid` when available
- Materialized view refresh: trigger `REFRESH MATERIALIZED VIEW CONCURRENTLY daily_metrics` AFTER the transaction commits (not inside BEGIN/COMMIT). Debounce: only refresh if last refresh was >30 seconds ago.

**Payload additions:**
```typescript
interface HealthRecordPayload {
  // ... existing fields
  sampleUUID?: string;  // new: HKSample.uuid
}

interface WorkoutPayload {
  // ... existing fields
  sampleUUID?: string;  // new: HKWorkout.uuid
}
```

### Removed Code

- `SyncManager` class -- replaced by SyncEngine (kept behind flag for first TestFlight, then deleted)
- `SyncManager.backgroundSession` -- dead code, unused lazy property
- `SyncManager.uploadBatchInBackground()` -- dead code
- `SyncManager.refreshMaterializedView()` -- moved server-side
- `HealthKitManager.syncData()` -- moved to SyncEngine
- `HealthKitManager.performAnchoredQuery()` -- moved to SyncEngine
- `HealthKitManager.performSampleQuery()` -- moved to SyncEngine
- `HealthKitManager.healingSync()` -- reimplemented in SyncEngine

### File Structure (after)

```
ios-sync/HealthSync/
├── HealthSyncApp.swift          # App entry, creates managers
├── HealthKitManager.swift       # Thin: auth, observers, UI state (~120 lines)
├── SyncEngine.swift             # NEW: fetch → stage → upload → commit (~300 lines)
├── OutboxStore.swift            # NEW: durable pending work (~100 lines)
├── AnchorStore.swift            # Unchanged: anchor persistence (~50 lines)
├── Models.swift                 # Updated: +sampleUUID, remove dead code (~280 lines)
└── ContentView.swift            # Minor: bind to new status properties (~180 lines)
```

Estimated total: ~1,030 lines (down from 1,116 despite adding features).

## Success Criteria

1. No data loss on upload failure (anchor only advances on full page success)
2. Crash recovery (outbox resumes incomplete pages on launch)
3. Sync speed equal to or faster than current (sequential uploads, less overhead)
4. Observer completion handler returns before upload starts (no HealthKit throttling)
5. No UI jank during sync (heavy work off MainActor)
6. Healing sync fills gaps from Feb 1, 2026 onward
7. Server handles UUID-based upsert with backward compat for existing data
8. Dirty-state machine ensures no data is stranded between observer notifications
