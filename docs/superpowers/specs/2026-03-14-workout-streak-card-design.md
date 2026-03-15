# Workout Streak Card

Standalone dashboard card showing workout consistency over the last 7 days with hover-reveal details.

## Visual Design

### Layout
- Card-terminal container (`.card-terminal` base class)
- Header: "workout streak" (monospace, uppercase, zinc-500) + date range right-aligned (zinc-700, e.g., "mar 8 – 14")
- 7 flex segments below header, one per day, equal width with 6px gap
- Each segment: 28px emoji above (8-10px gap) + day label bar below (24px height, rounded-4px)

### Segment States

**Active day (has workout)**:
- Emoji at 28px, full opacity
- Bar: emerald gradient fill, emerald border, day label in zinc-400
- Hover: tooltip with workout details

**Multi-workout day**:
- Two emoji stacked side-by-side at ~18px each
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
- Multi-workout: type names joined with " + ", divider line, per-workout summary rows
- Box shadow for depth

### Streak State (6+ of 7 days)
- Card border shifts to golden (rgba(251,191,36,0.25))
- Corner brackets glow golden with drop-shadow
- Inline badge after title: fire emoji (flickering animation) + count, golden background
- All active segments shift from emerald to amber/golden gradient
- Tooltips shift to golden border and golden type text

### Emoji Mapping
Map `workout_type` from the database to emoji:
- `HKWorkoutActivityTypeSwimming` -> 🏊
- `HKWorkoutActivityTypeRunning` -> 🏃
- `HKWorkoutActivityTypeCycling` -> 🚴
- `HKWorkoutActivityTypeTraditionalStrengthTraining` / `FunctionalStrengthTraining` -> 🏋️
- `HKWorkoutActivityTypeHiking` -> 🥾
- `HKWorkoutActivityTypeElliptical` -> 🏃 (fallback)
- `HKWorkoutActivityTypeYoga` -> 🧘
- Default/unknown -> 💪

## Data

### Query
```sql
SELECT
  TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') as day,
  workout_type,
  duration_seconds,
  total_energy_burned,
  avg_heart_rate,
  total_distance
FROM workouts
WHERE start_time >= NOW() - INTERVAL '7 days'
  AND workout_type != 'HKWorkoutActivityTypeWalking'
ORDER BY start_time
```

### API
New endpoint: `GET /api/health/workout-streak`

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
  "streakCount": 5,
  "dateRange": "mar 8 – 14"
}
```

- Always returns exactly 7 entries (today and 6 days prior)
- `streakCount`: count of days with at least one workout in the 7-day window
- Streak badge shows when `streakCount >= 6`

### Component
New file: `dashboard/components/WorkoutStreakCard.tsx`
- Client component (needs hover state)
- Fetches from `/api/health/workout-streak` via props (server-side data fetching in page.tsx)
- No external dependencies beyond existing Tailwind/React setup

### Placement
- Standalone card on the dashboard
- Position: after the weekly bar charts, before recent workouts (fits the flow of "this week" -> "recent")

## Responsive
- Segments use `flex: 1` to fill available width
- On narrow screens (~375px), segments compress naturally
- Emoji may need to scale down on mobile (22px at `sm:28px`)
- Tooltip positioning: check for edge overflow on first/last segments
