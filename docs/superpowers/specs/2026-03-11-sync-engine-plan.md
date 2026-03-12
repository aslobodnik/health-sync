# Sync Engine Redesign - Implementation Plan

**Spec:** `2026-03-11-sync-engine-redesign.md`
**Reviewed by:** Codex

## Stage 1: Server-side foundation (no iOS changes)

Safe to deploy independently. Makes the server ready for UUID-based upserts.

### 1.1 Schema migration
- Add `sample_uuid TEXT` column to `health_raw` and `workouts`
- Create partial unique indexes on `sample_uuid WHERE sample_uuid IS NOT NULL`
- Keep existing `record_hash` unique constraint on `health_raw` (backward compat)
- Keep existing `workout_hash` unique constraint on `workouts` (backward compat)

### 1.2 Sync endpoint: accept UUID, upsert logic
- Add `sampleUUID` to TypeScript interfaces for both health records and workouts
- Health records with `sampleUUID`: `INSERT ... ON CONFLICT (sample_uuid) DO UPDATE SET ...`
- Health records without: fall back to `ON CONFLICT (record_hash) DO NOTHING`
- Workouts with `sampleUUID`: `INSERT ... ON CONFLICT (sample_uuid) DO UPDATE SET ...`
- Workouts without: fall back to `ON CONFLICT (workout_hash) DO NOTHING`
- Delete handling: match by `sample_uuid` when available

### 1.3 Server-side materialized view refresh
- After transaction COMMIT in `POST /api/sync`, trigger `REFRESH MATERIALIZED VIEW CONCURRENTLY daily_metrics`
- Must run OUTSIDE the BEGIN/COMMIT transaction (CONCURRENTLY cannot run inside a transaction)
- Debounce: skip refresh if last refresh was <30 seconds ago (track with module-level timestamp)
- Keep `/api/sync/refresh` endpoint as manual trigger

**Verification:** Deploy to Vercel. Existing iOS app continues working unchanged (no UUID sent, falls back to hash paths). Test UUID upsert with curl. Verify mat view refreshes after sync.

---

## Stage 2: iOS data layer (no sync behavior changes)

Build new types and OutboxStore without changing any sync flow.

### 2.1 Update Models.swift
- Add `sampleUUID: String?` to `HealthRecordPayload` and `WorkoutPayload`
- Update `HKQuantitySample.toPayload()` to include `sample.uuid.uuidString`
- Update `HKCategorySample.toPayload()` to include `sample.uuid.uuidString`
- Update `HKWorkout.toPayload()` to include `workout.uuid.uuidString`
- Add `StagedPage`, `StagedBatch`, `BatchStatus` types

### 2.2 Create OutboxStore.swift
- `actor OutboxStore`
- Persist `StagedPage` as JSON files in documents directory
- Methods: `savePage()`, `loadPendingPages()`, `updateBatchStatus()`, `removePage()`, `pageCount()`

**Verification:** Build compiles. Existing sync still works unchanged (nothing calls OutboxStore yet). UUID now included in payloads sent to server.

---

## Stage 3: SyncEngine + rewire app (single stage, keep SyncManager as fallback)

Codex flagged that splitting SyncEngine creation from app rewiring creates dead code with no verification path. Merge into one stage. Keep SyncManager in the codebase behind a flag for rollback.

### 3.1 Create SyncEngine.swift
- `actor SyncEngine`
- Owns: AnchorStore reference, OutboxStore reference, HTTP upload
- Dirty-state machine: sticky dirty bit per type, re-check loop after each sync pass
- Paged HealthKit fetching (HKAnchoredObjectQuery with limit 1000)
- Sample → payload conversion (off MainActor)
- Batch creation (500 records per upload batch)
- Sequential upload per page (concurrent doesn't help with current server)
- Anchor advancement only after all batches in page succeed
- Retry logic: exponential backoff + jitter, max 3 attempts, transient-only

### 3.2 SyncEngine upload path
- Pre-encode batch JSON
- Save to OutboxStore before any network call
- Upload batches sequentially
- Update batch status in OutboxStore as uploads complete
- On full page success: commit anchor via AnchorStore, remove page from OutboxStore
- On failure after retries: leave in outbox, surface error

### 3.3 SyncEngine public API
- `markDirty(_ type: HealthDataType)` -- fetches one page, persists to outbox, returns (upload continues async). Called by observers.
- `syncAll()` -- manual sync trigger, marks all types dirty
- `resetAndResync(_ type: HealthDataType)` -- clears anchor, re-fetches
- `resumePendingPages()` -- called on launch for crash recovery
- Status reporting via async callback to MainActor

### 3.4 Rewire HealthKitManager
- Remove: `syncData()`, `performAnchoredQuery()`, `performSampleQuery()`, `healingSync()`, `fetchAndSync()` body
- Keep: authorization, observer setup, `@Published` status, reset trigger
- Observer callback: `await syncEngine.markDirty(type)` then `completionHandler()` -- data is persisted before ack
- `syncAll()`: delegates to `syncEngine.syncAll()`
- `resetAndResync()`: delegates to `syncEngine.resetAndResync(type)`

### 3.5 Update HealthSyncApp.swift
- Create SyncEngine (with AnchorStore, OutboxStore)
- Pass to HealthKitManager
- On launch: `syncEngine.resumePendingPages()` then `initializeIfAuthorized()`

### 3.6 Keep SyncManager.swift (flagged, not wired)
- Do NOT delete yet. Keep in project for rollback.
- Add `USE_SYNC_ENGINE = true` flag in SyncConfig
- If flag is false, fall back to old SyncManager path
- Delete SyncManager after one successful TestFlight cycle

### 3.7 Update ContentView.swift
- Bind to same `@Published` properties (minimal changes)

**Verification:** Full end-to-end sync. Open app → observers fire → SyncEngine fetches → persists to outbox → uploads → anchor commits. Manual sync works. Reset works. Kill app mid-sync → relaunch → outbox resumes. Flip flag → old path still works.

---

## Stage 4: Healing sync + cleanup

### 4.1 Healing sync in SyncEngine
- Runs on app launch after normal sync completes
- Date-bounded HKSampleQuery (7-day rolling window)
- One-time repair: explicit start date of 2026-02-01 (not relative), tracked by `healingRepairCompleted` flag
- Uses same upload path (idempotent via UUID upsert on server)
- Never touches anchors
- Tracked via `lastHealingSyncAt` in UserDefaults

### 4.2 Remove dead code
- Delete `SyncManager.swift` (after confirming SyncEngine works in TestFlight)
- Remove `USE_SYNC_ENGINE` flag
- Remove `refreshMaterializedView()` call from iOS (server handles it)
- Remove background URLSession lazy property
- Remove `uploadBatchInBackground()` method
- Remove any unused model fields or extensions

**Verification:** Launch app → healing sync runs one-time repair from Feb 1 2026. Subsequent launches → 7-day rolling heal. Check DB for recovered records. Verify no duplicates (UUID upsert). Verify SyncManager code is gone.

---

## Stage 5: Validation

### 5.1 Data integrity check
- Compare watch step totals on dashboard vs Apple Health for several recent days
- Verify no regressions in existing data
- Confirm healing sync recovered Feb-March gap data

### 5.2 Performance check
- Time a full manual sync (should be equal or faster than before)
- Monitor memory usage during sync (bounded by page size)
- Verify UI remains responsive during sync

### 5.3 Failure simulation
- Kill app mid-upload → verify outbox resumes on relaunch
- Disable network → verify anchor doesn't advance, batches stay in outbox
- Re-enable network → verify retry succeeds and anchor commits

### 5.4 Deploy
- Archive → TestFlight
- Monitor for a few days
- Verify dashboard data matches Apple Health daily

---

## Risk Mitigation

- **Rollback**: SyncManager kept through Stage 3, deletable via flag flip. Server changes are backward compatible (no UUID = old path).
- **Data safety**: Server upsert by UUID prevents duplicates even if iOS sends the same record twice during healing or retry.
- **Performance**: Sequential uploads match current behavior. No new bottleneck. Paged queries are a memory bound, not a speed change for typical 50-100 record syncs.
- **Incremental deployment**: Stage 1 deploys to Vercel with zero iOS changes. Stage 2 adds UUID to payloads with no behavior change. Stage 3 is the big swap but has rollback flag. Stage 4 is cleanup.
