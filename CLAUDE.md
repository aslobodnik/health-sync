# Health Sync

Personal Apple Health data pipeline - syncs iPhone health data to self-hosted dashboard.

**Live:** https://fit.justslobo.com

## Architecture

```
iPhone HealthKit → iOS App → Vercel API → NUC Postgres
                                              ↓
                              Next.js Dashboard ← Vercel
```

## Current State

**Database:** Postgres 16 on NUC (port 63456)
- ~7M health records in `health_raw` (after duplicate cleanup)
- 2,700+ workouts in `workouts`
- Data back to 2014

**iOS App:** Complete (`ios-sync/`)
- Auto-syncs steps, heart rate, RHR, HRV, workouts, weight, VO2 Max
- Background delivery via HKObserverQuery
- Delta-only fetching via HKAnchoredObjectQuery
- Chunked uploads (1000 records per batch)
- Swipe left on data type row → Reset to clear stuck anchor
- **Deployment:** TestFlight (personal use only, slobo is sole tester)
- To deploy: Xcode → Product → Archive → Distribute App → TestFlight
- **Current version:** 1.2 (build 1) - sync UX improvements, duplicate prevention
- **Versioning:** Bump version (1.x) for features, build number increments each archive
- After upload: App Store Connect → TestFlight → click new build → add to test group
- **IMPORTANT:** Secrets.plist must be in Xcode's "Copy Bundle Resources" build phase or app crashes on sync

**Dashboard:** Complete (`dashboard/`)
- MTD/YTD comparisons vs prior year for steps and active energy
- Heart rate trends (RHR, HRV with sparklines)
- Swimming totals with pace/100yd
- Steps and Zone 2 activity grids
- Recent workouts
- Streak indicators (6+ consecutive days meeting goal)

### Dashboard Design Guidelines

**Streak indicators:** Keep celebration subtle and integrated. Don't blow up card size or add overwhelming effects. The right approach:
- Compact inline badge (flame icon + count) next to title
- Golden accent color shift (corners, bars, main number)
- Same card dimensions - no layout changes
- Avoid: floating particles, massive icons, dramatic size changes

## Tech Stack

- **iOS App:** Swift/SwiftUI with HealthKit
- **Dashboard:** Next.js 16 + Tailwind 4
- **Database:** PostgreSQL 16
- **Deployment:** Vercel (dashboard + API), NUC (database)

## Database Connection

**IMPORTANT:** Always use the production NUC database for queries. Connection string is in `dashboard/.env.local`. Local database is incomplete/stale - do not use.

### Materialized Views

The `daily_metrics` view aggregates daily totals with deduplication:
- Must use `DISTINCT ON (start_time, end_time, value_numeric, record_type)` to avoid duplicates
- Refresh with: `REFRESH MATERIALIZED VIEW daily_metrics;`
- If data looks doubled, recreate the view with deduplication

## Schema Reference

### health_raw
- `record_type` - HKQuantityTypeIdentifier* (e.g., HeartRate, StepCount)
- `source_name` - "Apple Watch" or "Slobo's iPhone"
- `value_numeric` - the measurement value
- `unit` - count, count/min, kcal, mi, etc.
- `start_time`, `end_time` - timestamptz
- `metadata` - JSONB with extra fields
- `record_hash` - unique constraint for deduplication

### workouts
- `workout_type` - HKWorkoutActivityType* (Walking, Running, etc.)
- `duration_seconds`, `total_distance`, `total_energy_burned`
- `avg_heart_rate`, `min_heart_rate`, `max_heart_rate`
- `statistics` - JSONB with additional stats
- `workout_hash` - unique constraint for deduplication

## Key Query Logic

- **Watch-only:** All queries filter `source_name ILIKE '%watch%'` to avoid phone double-counting
- **Zone 2:** Workouts with avg HR 107-125 bpm (age 42)
- **MTD/YTD comparisons:** Same day-of-year for fair comparison (e.g., Jan 1-16 vs Jan 1-16 last year)
- **Swimming:** Normalizes miles to yards (iOS sends miles, XML used yards)

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
│   │   ├── opengraph-image.tsx # Dynamic OG image
│   │   └── page.tsx
│   ├── components/             # UI components
│   │   ├── PeriodCard.tsx      # MTD/YTD bar charts
│   │   ├── HeartRateTrend.tsx  # RHR/HRV sparklines
│   │   ├── SwimmingCard.tsx    # Swimming totals + pace
│   │   ├── ActivityGrid.tsx    # 365-day grids
│   │   └── ...
│   └── lib/
│       └── queries.ts          # SQL queries
├── sql/schema.sql              # Database schema
├── parse_export.py             # One-time XML import
└── PLAN.md                     # Roadmap
```

## Development

```bash
# Dashboard
cd dashboard && npm run dev

# iOS App
open ios-sync/HealthSync.xcodeproj
```

## Troubleshooting

Always start from the data layer and work up:

1. **Database first** - Query Postgres directly to verify data exists
2. **API second** - Curl the API endpoints to check the response
3. **UI last** - Only debug the frontend once data and API are confirmed working

Common issues:
- Duplicate records (use DISTINCT ON)
- Watch + phone double-counting (filter by `source_name ILIKE '%watch%'`)
- Swimming showing wrong units (iOS sends miles, normalize to yards)
- Stuck sync for a data type → swipe left on row in iOS app, tap Reset
- Materialized view stale → POST to `/api/sync/refresh` (iOS app calls this after sync)
- **Dates off by one day** → API must return `TO_CHAR(date, 'YYYY-MM-DD')` not DATE type. Vercel (UTC) and local (EST) serialize dates differently. See `dates-skill` for debugging.
- **Cal vs kcal duplicates** → Imported XML used "Cal", iOS sync uses "kcal". Delete kcal records that overlap with Cal records on same start_time/end_time.
