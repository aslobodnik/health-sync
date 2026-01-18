# Health Sync - Roadmap

## Current State (January 2026)

**V1 (Manual Export)** - Complete
**Phase 1 (iOS Auto-Sync)** - Complete

Auto-sync pipeline working: iPhone HealthKit → iOS App → Vercel API → NUC Postgres

---

## V1 - Manual Export + Dashboard (Complete)

- [x] Postgres schema (`health_raw`, `workouts`)
- [x] `parse_export.py` streaming XML parser with hash-based deduplication
- [x] Next.js dashboard at `fit.justslobo.com`
- [x] 9.2M health records imported
- [x] 2,700+ workouts imported

---

## Phase 1 - iOS Auto-Sync (Complete)

The iOS app (`ios-sync/`) syncs HealthKit data to the server automatically.

### Implementation Details

**iOS App (`ios-sync/HealthSync/`)**
- Swift/SwiftUI with HealthKit capability
- `HKObserverQuery` for background change notifications
- `HKAnchoredObjectQuery` for delta-only fetching (no full re-downloads)
- Background URLSession for uploads
- Anchor persistence per data type
- Chunked uploads (100 records per batch) for Vercel payload limits

**Synced Data Types**
- Steps
- Heart rate
- Resting heart rate
- HRV
- Workouts (filtered to real types from watch only)
- Weight (body mass)
- VO2 Max

**Server Endpoint (`/api/sync`)**
- Accepts POST with health records and workouts
- Hash-based deduplication (`ON CONFLICT DO NOTHING`)
- API secret authentication

**Deployment**
- Dashboard: Vercel at `fit.justslobo.com`
- Database: PostgreSQL 16 on NUC (9.2M records)
- Router forwards port 63456 to NUC:5432

### Key Decisions Made

1. **Watch-only filtering**: All queries filter `source_name ILIKE '%watch%'` to avoid phone double-counting
2. **Workout filtering**: Only sync real workout types (walking, running, swimming, strength, etc.) from watch sources
3. **Chunking**: 100 records per batch to stay under Vercel's payload limit
4. **Unit normalization**: Swimming converts miles to yards (iOS sends miles, XML used yards)

---

## Phase 2 - Dashboard Improvements (In Progress)

Simplifying the dashboard to focus on:
- [x] MTD vs prior MTD for steps and active energy
- [x] YTD vs prior YTD comparisons
- [x] Heart rate trends (RHR, HRV)
- [x] Swimming with pace/100yd
- [x] VO2 Max 3-month trend display
- [ ] Remove stale sleep data (not being synced)

---

## Future Phases

### Enable Sleep Tracking
- Add sleep types to iOS app sync
- Update dashboard with sleep display

### Workout Route Maps
- Parse GPX files from workout routes
- Display maps on workout detail views

### Distribution Polish
- [x] TestFlight setup (January 2026)
- [x] iOS app v1.1 with weight/VO2 Max sync
- Better error logging and retry handling

### Weight Dashboard Display
- Add weight trend visualization (when needed)

---

## Files

```
health-sync/
├── ios-sync/                    # iOS app
│   └── HealthSync/
│       ├── HealthKitManager.swift  # HK queries and observers
│       ├── SyncManager.swift       # Upload queue
│       ├── AnchorStore.swift       # Persists query anchors
│       ├── Models.swift            # Config and types
│       └── ContentView.swift       # UI
├── dashboard/                   # Next.js dashboard
│   ├── app/
│   │   ├── api/sync/           # iOS sync endpoint
│   │   ├── api/health/         # Dashboard API routes
│   │   └── page.tsx
│   └── lib/
│       └── queries.ts          # SQL queries
├── sql/schema.sql              # Database schema
├── parse_export.py             # One-time XML import
└── CLAUDE.md                   # Project context
```
