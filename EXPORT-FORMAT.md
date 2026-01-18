# Apple Health Export XML Format

Analysis of `export-2026-01-15.zip` from iPhone.

## Export Structure

```
apple_health_export/
├── export.xml          # 3.2GB, 13M lines - main data
├── export_cda.xml      # 1.6GB - Clinical Document Architecture format (ignore)
├── clinical-records/   # 142 files (ignore for now)
└── workout-routes/     # 1,479 GPX files with GPS tracks
```

## XML Schema (from DTD)

Top-level elements in `export.xml`:
- `ExportDate` - when export was created
- `Me` - user profile (DOB, sex, blood type)
- `Record` - individual health samples (the bulk of data)
- `Workout` - workout sessions with nested statistics
- `ActivitySummary` - daily activity rings
- `Correlation` - grouped records (e.g., blood pressure = systolic + diastolic)

## Record Types (our focus)

### Steps
```xml
<Record
  type="HKQuantityTypeIdentifierStepCount"
  sourceName="slobo's watch"
  unit="count"
  value="105"
  startDate="2024-09-15 09:59:24 -0500"
  endDate="2024-09-15 10:07:20 -0500"
  creationDate="2024-09-15 10:10:47 -0500"/>
```
- **Count:** 552,687 records
- **Unit:** count
- **Note:** Multiple sources (Watch, iPhone) - may need deduplication

### Heart Rate
```xml
<Record
  type="HKQuantityTypeIdentifierHeartRate"
  sourceName="slobo's watch"
  unit="count/min"
  value="63"
  startDate="2024-09-15 10:07:43 -0500"
  endDate="2024-09-15 10:07:43 -0500"/>
```
- **Count:** 1,290,722 records
- **Unit:** count/min (BPM)
- **Note:** startDate == endDate (point-in-time samples)

### Sleep
```xml
<Record
  type="HKCategoryTypeIdentifierSleepAnalysis"
  sourceName="Clock"
  value="HKCategoryValueSleepAnalysisAsleepCore"
  startDate="2017-05-07 23:00:00 -0500"
  endDate="2017-05-08 06:06:48 -0500"/>
```
- **Count:** 52,225 records
- **Sleep stage values:**
  - `HKCategoryValueSleepAnalysisInBed` (10,342)
  - `HKCategoryValueSleepAnalysisAwake` (7,645)
  - `HKCategoryValueSleepAnalysisAsleepUnspecified` (7,037) - older data
  - `HKCategoryValueSleepAnalysisAsleepCore` (16,669) - iOS 16+
  - `HKCategoryValueSleepAnalysisAsleepREM` (6,388) - iOS 16+
  - `HKCategoryValueSleepAnalysisAsleepDeep` (4,144) - iOS 16+
- **Note:** Each stage is a separate record; reconstruct nights by grouping

### Workouts
```xml
<Workout
  workoutActivityType="HKWorkoutActivityTypeCycling"
  duration="91.77"
  durationUnit="min"
  sourceName="Slobo's Watch"
  startDate="2018-09-23 08:56:43 -0500"
  endDate="2018-09-23 10:28:29 -0500">
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate"
    average="92.0156" minimum="81" maximum="109" unit="count/min"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned"
    sum="663.461" unit="Cal"/>
  <WorkoutRoute sourceName="..." startDate="..." endDate="...">
    <FileReference path="/workout-routes/route_2018-09-23_8.56am.gpx"/>
  </WorkoutRoute>
</Workout>
```
- **Count:** 2,839 workouts
- **Workout types:**
  - Walking: 1,510
  - Strength Training: 630
  - Running: 126
  - Cycling: 110
  - Swimming: 90
  - Stair Climbing: 88
  - Boxing: 62
  - Rowing: 51
  - Hiking: 45
  - Others: ~100
- **WorkoutStatistics:** Nested element with HR avg/min/max, calories, distance
- **WorkoutRoute:** Links to GPX file for GPS data
- **Note:** HR stats available from ~2022 onwards

## Other Useful Record Types (for later)

| Type | Count | Notes |
|------|-------|-------|
| ActiveEnergyBurned | 2.1M | Calories burned |
| BasalEnergyBurned | 946K | Resting calories |
| DistanceWalkingRunning | 883K | Miles/km |
| AppleExerciseTime | 208K | Exercise minutes |
| RespiratoryRate | 64K | Breaths/min |
| OxygenSaturation | 20K | SpO2 % |
| RestingHeartRate | ? | Daily resting HR |
| HeartRateVariability | ? | HRV data |

## Date Formats

All dates are in format: `YYYY-MM-DD HH:MM:SS ±HHMM`
- Example: `2024-09-15 10:07:43 -0500`
- Timezone included (CST = -0500, CDT = -0600)

## Data Range

- **Earliest data:** 2017
- **Latest data:** 2026-01-15 (export date)
- **~8 years of history**

## Parsing Notes

1. **File size:** 3.2GB XML - need streaming parser (SAX/iterparse), not DOM
2. **Deduplication:** Same data may come from Watch and iPhone - dedupe by timestamp
3. **Device info:** Embedded as escaped XML in `device` attribute (optional to parse)
4. **Timezone handling:** Keep original timezone or normalize to UTC

## Zone 2 Training Strategy

For zone 2 analysis:
1. Get workout HR stats (avg/min/max) directly from WorkoutStatistics
2. OR: Query raw HR records where timestamp falls within workout start/end
3. Define zones based on max HR (e.g., Zone 2 = 60-70% of max)
4. Calculate time-in-zone by analyzing HR samples during workouts
