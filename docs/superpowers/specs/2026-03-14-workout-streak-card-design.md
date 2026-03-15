# Workout Streak Card

Standalone dashboard card showing workout consistency over the last 7 days with hover-reveal details.

## Visual Design

### Layout
- Card-terminal container (`.card-terminal` base class, reuse existing CSS from `globals.css`)
- Header: "workout streak" (monospace, uppercase, zinc-500) + date range right-aligned (zinc-700, e.g., "mar 8 – 14")
- 7 flex segments below header, one per day, equal width with 6px gap
- Each segment: 28px emoji above (8-10px gap) + day label bar below (24px height, rounded-4px)

### Segment States

**Active day (has workout)**:
- Emoji at 28px, full opacity
- Bar: emerald gradient fill, emerald border, day label in zinc-400
- Hover: tooltip with workout details

**Multi-workout day**:
- Two emoji side-by-side at ~18px each
- Tooltip shows split view with divider between workouts

**Rest day (no workout)**:
- Dimmed dash "-" at 28px, opacity 0.12, grayscale
- Bar: dark background (#1a1a1e), zinc-800 border, day label in zinc-700

**Today (no workout yet)**:
- Dimmed "?" at 28px, opacity 0.12
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
- z-index: 20 (above scanlines overlay at z-10)

### Streak State (6+ of 7 days)
- Reuse existing `.streak-card` CSS class from `globals.css` (golden border, glowing corner brackets)
- Inline badge after title: reuse `.streak-badge-inline` with fire emoji (`.flame-flicker` animation) + count
- All active segments shift from emerald to amber/golden gradient
- Tooltips shift to golden border and golden type text

### Emoji Mapping
Map `workout_type` from the database to emoji:
- `HKWorkoutActivityTypeSwimming` -> 🏊
- `HKWorkoutActivityTypeRunning` -> 🏃
- `HKWorkoutActivityTypeCycling` -> 🚴
- `HKWorkoutActivityTypeTraditionalStrengthTraining` / `FunctionalStrengthTraining` -> 🏋️
- `HKWorkoutActivityTypeHiking` -> 🥾
- `HKWorkoutActivityTypeStairClimbing` / `Stairs` -> 🪜
- `HKWorkoutActivityTypeRowing` -> 🚣
- `HKWorkoutActivityTypeHighIntensityIntervalTraining` -> 🔥
- `HKWorkoutActivityTypeClimbing` -> 🧗
- `HKWorkoutActivityTypeYoga` -> 🧘
- Default/unknown -> 💪

## Data

### Query function
Add `getWorkoutStreak()` to `dashboard/lib/queries.ts`, following the existing pattern (async function, pool.query, return rows).

```sql
SELECT
  TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') as day,
  workout_type,
  duration_seconds,
  total_energy_burned,
  avg_heart_rate,
  total_distance
FROM workouts
WHERE start_time >= DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '6 days'
  AND workout_type != 'HKWorkoutActivityTypeWalking'
ORDER BY start_time
```

The API route groups rows by day and builds the 7-day array (filling in empty days).

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

- Always returns exactly 7 entries (today and 6 days prior), using day-truncated boundaries
- `activeDayCount`: count of days with at least one workout in the 7-day window
- Streak badge shows when `activeDayCount >= 6`

### Component
New file: `dashboard/components/WorkoutStreakCard.tsx`
- Client component (needs hover state for tooltips)
- Receives data via props from `page.tsx`
- Add `WorkoutStreakData` interface to `page.tsx` alongside existing types (`StepsData`, `WorkoutsData`, etc.)
- Add fetch call to the `Promise.all` block in `page.tsx`'s `useEffect`, matching the existing client-side fetch pattern
- Add `workoutStreak` to component state via `useState`

### Placement
- Standalone card on the dashboard
- Position: after the weekly bar charts, before recent workouts

## Responsive
- Segments use `flex: 1` to fill available width
- On narrow screens (~375px), segments compress naturally
- Emoji scales: 22px default, `sm:28px` on wider screens
- Tooltip positioning: first/last segments may need left/right offset to avoid edge overflow
