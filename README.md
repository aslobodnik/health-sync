# Health Sync

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Personal Apple Health data pipeline - syncs iPhone health data to self-hosted dashboard.

<p align="center">
  <img src="docs/ios-app.png" width="250" alt="iOS App" />
  <img src="docs/dashboard.png" width="500" alt="Dashboard" />
</p>

## Architecture

```
iPhone HealthKit → iOS App → Vercel API → NUC Postgres
                                              ↓
                              Next.js Dashboard ← Vercel
```

## Components

### iOS App (`ios-sync/`)
Swift/SwiftUI app that:
- Reads HealthKit data (steps, heart rate, workouts)
- Uses `HKObserverQuery` for background change notifications
- Uses `HKAnchoredObjectQuery` for delta-only syncs
- Uploads to server via HTTPS (chunked to avoid payload limits)

### Dashboard (`dashboard/`)
Next.js app deployed on Vercel:
- Connects to Postgres on NUC via public IP
- MTD/YTD comparisons for steps and active energy
- Heart rate trends (RHR, HRV)
- Swimming tracking with pace/100yd
- Zone 2 training grid
- Dynamic OpenGraph image with live stats

### Database
PostgreSQL 16 on NUC (Ubuntu):
- 9.2M health records
- 2,700+ workouts
- Data back to 2014

## Data Flow

**Historical data:** XML export from iPhone → `parse_export.py` → Postgres

**Ongoing sync:** HealthKit → iOS app → `/api/sync` → Postgres (delta only, deduped via hash)

## Setup

### iOS App

#### Requirements
- **Mac** with Xcode 15+ installed
- **Apple Developer Program** membership ($99/year) - required for TestFlight distribution
- **iPhone** with HealthKit data

#### Local Development
```bash
open ios-sync/HealthSync.xcodeproj
# Set Team in Signing & Capabilities
# Copy Secrets.plist.example to Secrets.plist
# Add your API secret to Secrets.plist
# Build to iPhone (Cmd+R)
```

#### TestFlight Distribution

1. **Archive the app**
   - In Xcode: Product → Archive
   - Wait for build to complete

2. **Distribute to App Store Connect**
   - In the Organizer window, select your archive
   - Click "Distribute App"
   - Choose "App Store Connect" → Distribute

   ![Xcode Distribution](docs/xcode-distribution.png)

3. **Add to Test Group**
   - Go to [App Store Connect](https://appstoreconnect.apple.com)
   - Navigate to your app → TestFlight
   - Wait for build to finish processing (yellow = processing, green = ready)
   - Click the build, then add to your test group under "Internal Testing"
   - Install via TestFlight app on iPhone

### Dashboard
```bash
cd dashboard
npm install
npm run dev
```

Environment variables (Vercel):
```
DATABASE_URL=postgresql://user:pass@host:port/health_sync
SYNC_API_SECRET=your-secret-here
```

## Current Metrics

| Metric | What | Source |
|--------|------|--------|
| Steps | Daily count, MTD/YTD vs prior year | Watch only |
| Active Energy | Calories burned, MTD/YTD vs prior year | Watch only |
| Resting HR | Daily trend, 7-day average | Watch |
| HRV | Heart rate variability trend | Watch |
| Zone 2 | Weekly minutes (HR 107-125 bpm) | Workout data |
| Swimming | YTD yards, pace/100yd | Watch workouts |
| Workouts | Recent non-walking workouts | Watch |

## Files

```
health-sync/
├── ios-sync/                    # iOS app
│   └── HealthSync/
│       ├── HealthKitManager.swift
│       ├── SyncManager.swift
│       └── Models.swift
├── dashboard/                   # Next.js dashboard
│   ├── app/
│   │   ├── api/sync/           # iOS sync endpoint
│   │   ├── api/health/         # Dashboard API routes
│   │   └── page.tsx
│   └── lib/
│       └── queries.ts          # SQL queries
├── sql/schema.sql              # Database schema
├── parse_export.py             # One-time XML import
├── CLAUDE.md                   # Project context
├── PLAN.md                     # Roadmap
├── EXPORT-FORMAT.md            # XML schema reference
└── SCHEMA-SPEC.md              # Database design
```

## Self-Hosting

To run your own instance:

1. **Apple Developer Program**: Sign up at [developer.apple.com](https://developer.apple.com/programs/) ($99/year) - required for TestFlight
2. **Database**: PostgreSQL 16+ with the schema from `sql/schema.sql`
3. **Dashboard**: Deploy to Vercel (or any Node.js host)
   - Set `DATABASE_URL` to your Postgres connection string
   - Set `SYNC_API_SECRET` to a random string
4. **iOS App**: Build and distribute via TestFlight (see Setup above)
   - Copy `Secrets.plist.example` to `Secrets.plist`
   - Set `API_SECRET` to match your `SYNC_API_SECRET`
   - Update `serverURL` in `Models.swift` to your dashboard URL
5. **Historical data**: Export Apple Health XML and run `parse_export.py`

## License

MIT - see [LICENSE](LICENSE)
