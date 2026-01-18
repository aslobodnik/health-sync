# Health Data Storage: Schema Design Spec

## Problem

Store 8+ years of Apple Health data (millions of records) in a way that:
1. Handles current data types (steps, HR, sleep, workouts)
2. Gracefully accepts future Apple additions without schema changes
3. Supports fast queries for dashboards
4. Preserves original data for auditability

## Constraints

- Apple changes the export format without notice
- New health metrics get added regularly (e.g., sleep stages in iOS 16)
- Same data can come from multiple sources (Watch, iPhone, apps)
- Volume: ~13M records currently, growing

## Design Approach: "Archive + Extract"

### Core Principle
Store the raw Apple data as-is in a flexible format. Extract queryable fields into indexed columns. Never throw away original data.

### Two Tables

**1. health_raw** - All individual health samples
- Indexed columns: type, start_time, end_time, source
- Extracted value columns: numeric value (for steps/HR/etc), text value (for categories like sleep stages)
- JSONB column: full original record from Apple (the safety net)

**2. workouts** - Workout sessions (structurally different enough to warrant separation)
- Indexed columns: workout_type, start_time, end_time, duration
- Extracted stats: HR avg/min/max, calories, distance
- JSONB column: full original record
- Reference to GPX route file if exists

### Why JSONB for Original Data?

The "sleep stage test": In 2021, sleep data had 2 states (InBed, Asleep). In 2022, Apple added 4 new stages (Core, REM, Deep, Awake).

With rigid columns: requires migration, risking data loss or downtime.
With JSONB: new fields just appear in the JSON. Query layer adapts, storage layer doesn't change.

### Handling Unknown Future Types

When parser encounters a type it doesn't recognize:
1. Store it anyway (type string, timestamps, full JSONB)
2. Log it for review
3. No migration needed
4. Add extraction logic later when we care about that type

## Key Decisions

### Deduplication
**Decision:** Store all sources, dedupe at query time.
**Rationale:** Preserves full audit trail. Different sources may have different accuracy. Can always add deduped views later.

### Timestamps
**Decision:** Store in UTC, keep original timezone in JSONB.
**Rationale:** Consistent querying. Can reconstruct local time when needed.

### Value Extraction
**Decision:** Extract common fields (numeric value, text value) into columns for fast queries. Keep everything else in JSONB.
**Rationale:** 90% of queries hit these fields. Avoids JSON parsing for common operations.

### Workouts Separate
**Decision:** Separate table for workouts.
**Rationale:** Workouts have nested structure (statistics, routes, events). Different query patterns. Worth the separation.

## Query Patterns Supported

| Query | How It Works |
|-------|--------------|
| Daily step totals | Aggregate numeric value by day, filter by type |
| HR during workout | Join workout time range with HR records |
| Sleep stages per night | Group sleep records by night, pivot on stage type |
| Zone 2 time | Filter workouts by HR avg range, or analyze HR samples during workout windows |
| "What data do I have?" | Distinct types, count per type |

## Future-Proofing Checklist

- [ ] New Apple metric type → automatically stored, extract later
- [ ] New fields on existing type → captured in JSONB, extract if needed
- [ ] Format changes → parser updates, storage unchanged
- [ ] New workout statistics → captured in JSONB
- [ ] Schema evolution → add views, not migrations

## Open Questions

1. **Partitioning by time?** - Probably not needed for personal use. Revisit if queries get slow.
2. **Materialized views for dashboards?** - Start with regular views, materialize if performance requires.
3. **Data retention?** - Keep everything. It's your data. Disk is cheap.

## Alternatives Considered

| Approach | Rejected Because |
|----------|------------------|
| Table per data type | Too many migrations as Apple adds types |
| Pure EAV | Query performance nightmare |
| Pure JSONB (no extracted columns) | Common queries would be slower than necessary |
| Time-series DB (InfluxDB, TimescaleDB) | Overkill for personal use, adds operational complexity |

## Next Steps

1. Get second opinion on this approach
2. Choose database (Postgres on NUC makes sense)
3. Write parser that outputs to this schema
4. Create views for dashboard queries
