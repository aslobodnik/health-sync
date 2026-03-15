# Workout Streak Card

Standalone dashboard card showing workout consistency over the last 7 days with hover-reveal details.

## Visual Design

### Layout
- Card-terminal container (`.card-terminal` class from `globals.css:41`)
- Header: "workout streak" (monospace, uppercase, zinc-500) + date range right-aligned (zinc-700, e.g., "mar 8 – 14")
- 7 flex segments below header, one per day, equal width with 6px gap
- Each segment: 28px emoji above (8-10px gap) + day label bar below (24px height, rounded-4px)

### Segment States

**Active day (has workout)**:
- Emoji at 22px base, `sm:text-[28px]` on wider screens
- Bar: emerald gradient fill, emerald border, day label in zinc-400
- Hover: tooltip with workout details

**Multi-workout day**:
- Two emoji side-by-side at ~14px base / `sm:text-[18px]`
- Tooltip shows split view with divider between workouts

**Rest day (no workout)**:
- Dimmed dash "-", opacity 0.12, grayscale
- Bar: dark background (#1a1a1e), zinc-800 border, day label in zinc-700

**Today (no workout yet)**:
- Dimmed "?", opacity 0.12
- Bar: cyan dashed border, day label in cyan-400

### Hover Tooltip
- Appears above the segment column on hover
- Dark background (rgba(15,15,18,0.95)), emerald border, 6px radius
- Arrow pointing down to segment
- Content (monospace, 10px):
  - Workout type name (emerald, bold)
  - Duration, calories, avg HR (stat label in zinc-600, value in white)
  - Distance with "mi" unit (if > 0.1)
- Multi-workout: type names joined with " + ", divider line, per-workout summary rows
- Box shadow for depth
- z-index: 20 (above card content at z-10; scanlines at z-50 have `pointer-events: none` so tooltips remain interactive)
- First/last segments: shift tooltip left/right to avoid viewport overflow

### Streak State (6+ of 7 days)
- Reuse `.streak-card` class (`globals.css:71`) for golden border + glowing corners
- Inline badge: reuse `.streak-badge-inline` (`globals.css:83`) + `.streak-flame-mini` (`globals.css:93`) for fire SVG icon with `flame-flicker` keyframe animation + `.streak-count-mini` (`globals.css:105`) for count text
- All active segments shift from emerald to amber/golden gradient
- Tooltips shift to golden border and golden type text

### Emoji Mapping
Map `workout_type` from the database to emoji. iOS sync writes explicit names for 10 types (see `Models.swift:297-311`) and falls through to `HKWorkoutActivityTypeOther` for the rest. XML-imported data may contain additional type names.

```
HKWorkoutActivityTypeSwimming                    -> 🏊
HKWorkoutActivityTypeRunning                     -> 🏃
HKWorkoutActivityTypeCycling                     -> 🚴
HKWorkoutActivityTypeTraditionalStrengthTraining -> 🏋️
HKWorkoutActivityTypeFunctionalStrengthTraining  -> 🏋️
HKWorkoutActivityTypeHiking                      -> 🥾
HKWorkoutActivityTypeYoga                        -> 🧘
HKWorkoutActivityTypeElliptical                  -> 🏃‍♂️
HKWorkoutActivityTypeRowing                      -> 🚣
HKWorkoutActivityTypeStairClimbing               -> 🪜  (XML import)
HKWorkoutActivityTypeStairs                      -> 🪜  (XML import)
HKWorkoutActivityTypeClimbing                    -> 🧗  (XML import)
HKWorkoutActivityTypeHighIntensityIntervalTraining -> 🔥 (XML import)
HKWorkoutActivityTypeOther                       -> 💪
Default/unknown                                  -> 💪
```

## Data

### Query function
Add `getWorkoutStreak()` to `dashboard/lib/queries.ts`. Use the `query<T>()` helper from `db.ts` (not direct `pool.query`), matching the pattern used by all existing query functions.

```sql
SELECT
  TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') as day,
  workout_type,
  duration_seconds,
  total_energy_burned,
  avg_heart_rate,
  total_distance
FROM workouts
WHERE start_time AT TIME ZONE 'America/New_York'
      >= DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '6 days'
  AND workout_type != 'HKWorkoutActivityTypeWalking'
ORDER BY start_time
```

The API route groups rows by day and builds the 7-day array (filling in empty days with `workouts: []`).

### API
New endpoint: `GET /api/health/workout-streak`
New file: `dashboard/app/api/health/workout-streak/route.ts`

Response shape:
```json
{
  "days": [
    {
      "date": "2026-03-08",
      "dayLabel": "SAT",
      "workouts": [
        {
          "type": "HKWorkoutActivityTypeSwimming",
          "durationMinutes": 42,
          "calories": 380,
          "avgHR": 134,
          "distance": 1.2
        }
      ]
    },
    {
      "date": "2026-03-09",
      "dayLabel": "SUN",
      "workouts": []
    }
  ],
  "activeDayCount": 5,
  "dateRange": "mar 8 – 14"
}
```

- Always returns exactly 7 entries (today and 6 days prior) using day-truncated boundaries in America/New_York
- Dates returned as `YYYY-MM-DD` strings (safe from timezone serialization issues, consistent with `WeeklyBarChart` date handling)
- `activeDayCount`: count of days with at least one workout
- Streak badge shows when `activeDayCount >= 6`

### Component
New file: `dashboard/components/WorkoutStreakCard.tsx`
- Client component (needs hover state for tooltips)
- Receives data via props from `page.tsx`
- Add `WorkoutStreakData` interface to `page.tsx` alongside existing types (`StepsData`, `WorkoutsData`, etc.)
- Add fetch to the `Promise.all` block in `page.tsx`'s `useEffect` (client-side, matching existing pattern)
- Add `workoutStreak` to component state via `useState`

### Placement
- Standalone card in `page.tsx`, inside the existing `max-w-md mx-auto` container
- Position: after the weekly bar charts section (line 179), before year comparison (line 198)
- Wrapped in `reveal reveal-delay-3` for staggered animation

## Responsive
- Segments use `flex: 1` to fill available width
- On narrow screens (~375px), segments compress naturally
- Emoji scales: 22px default, 28px at `sm:` breakpoint
- Tooltip positioning: first/last segments offset to avoid viewport edge clipping
