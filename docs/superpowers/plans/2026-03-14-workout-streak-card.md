# Workout Streak Card Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone card to the dashboard showing workout consistency over the last 7 days with emoji indicators and hover tooltips.

**Architecture:** New query function in `queries.ts` -> new API route at `/api/health/workout-streak` -> new `WorkoutStreakCard` component -> wired into `page.tsx` fetch/render cycle. Reuses existing `.card-terminal` and `.streak-card` CSS classes.

**Tech Stack:** Next.js 16, React, Tailwind 4, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-03-14-workout-streak-card-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `dashboard/app/api/health/workout-streak/route.ts` | API route: calls query, groups by day, returns 7-day array |
| Create | `dashboard/components/WorkoutStreakCard.tsx` | UI component: segments, emoji, tooltips, streak state |
| Modify | `dashboard/lib/queries.ts` | Add `getWorkoutStreak()` query function + `WorkoutStreakRow` interface |
| Modify | `dashboard/app/page.tsx` | Add interface, state, fetch call, render component |

---

## Task 1: Query Function

**Files:**
- Modify: `dashboard/lib/queries.ts` (append after line 689)

- [ ] **Step 1: Add interface and query function to `queries.ts`**

Append to end of file:

```typescript
export interface WorkoutStreakRow {
  day: string;
  workout_type: string;
  duration_seconds: number;
  total_energy_burned: number | null;
  avg_heart_rate: number | null;
  total_distance: number | null;
}

export async function getWorkoutStreak(): Promise<WorkoutStreakRow[]> {
  const sql = `
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
  `;
  return query<WorkoutStreakRow>(sql);
}
```

- [ ] **Step 2: Verify query returns data**

```bash
cd dashboard && npx tsx -e "
  const { getWorkoutStreak } = require('./lib/queries');
  getWorkoutStreak().then(r => { console.log(JSON.stringify(r.slice(0,3), null, 2)); process.exit(); });
"
```

Expected: JSON array of workout rows with `day`, `workout_type`, `duration_seconds`, etc.

- [ ] **Step 3: Commit**

```bash
git add dashboard/lib/queries.ts
git commit -m "add getWorkoutStreak query function"
```

---

## Task 2: API Route

**Files:**
- Create: `dashboard/app/api/health/workout-streak/route.ts`

- [ ] **Step 1: Create the API route**

Create `dashboard/app/api/health/workout-streak/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getWorkoutStreak } from "@/lib/queries";

interface WorkoutDetail {
  type: string;
  durationMinutes: number;
  calories: number | null;
  avgHR: number | null;
  distance: number | null;
}

interface StreakDay {
  date: string;
  dayLabel: string;
  workouts: WorkoutDetail[];
}

export async function GET() {
  try {
    const rows = await getWorkoutStreak();

    // Build 7-day array (today and 6 days prior)
    const now = new Date();
    // Use Eastern time for day boundaries
    const eastern = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = eastern.formatToParts(now);
    const todayYear = Number(parts.find(p => p.type === "year")!.value);
    const todayMonth = Number(parts.find(p => p.type === "month")!.value) - 1;
    const todayDay = Number(parts.find(p => p.type === "day")!.value);
    const todayDate = new Date(todayYear, todayMonth, todayDay);

    const days: StreakDay[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayDate);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();

      const dayWorkouts = rows
        .filter((r) => r.day === dateStr)
        .map((r) => ({
          type: r.workout_type,
          durationMinutes: Math.round(r.duration_seconds / 60),
          calories: r.total_energy_burned ? Math.round(r.total_energy_burned) : null,
          avgHR: r.avg_heart_rate ? Math.round(r.avg_heart_rate) : null,
          distance: r.total_distance ? Math.round(r.total_distance * 10) / 10 : null,
        }));

      days.push({ date: dateStr, dayLabel, workouts: dayWorkouts });
    }

    const activeDayCount = days.filter((d) => d.workouts.length > 0).length;

    // Date range label
    const start = new Date(todayDate);
    start.setDate(start.getDate() - 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
    const dateRange = `${fmt(start)} – ${fmt(todayDate)}`;

    return NextResponse.json({ days, activeDayCount, dateRange });
  } catch (error) {
    console.error("Error fetching workout streak:", error);
    return NextResponse.json(
      { error: "Failed to fetch workout streak data" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify the endpoint**

```bash
cd dashboard && npm run dev &
sleep 3
curl -s http://localhost:3000/api/health/workout-streak | npx -y json
kill %1
```

Expected: JSON with `days` (7 entries), `activeDayCount`, `dateRange`.

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/api/health/workout-streak/route.ts
git commit -m "add workout streak api endpoint"
```

---

## Task 3: WorkoutStreakCard Component

**Files:**
- Create: `dashboard/components/WorkoutStreakCard.tsx`

- [ ] **Step 1: Create the component file**

Create `dashboard/components/WorkoutStreakCard.tsx`:

```tsx
"use client";

interface WorkoutDetail {
  type: string;
  durationMinutes: number;
  calories: number | null;
  avgHR: number | null;
  distance: number | null;
}

interface StreakDay {
  date: string;
  dayLabel: string;
  workouts: WorkoutDetail[];
}

interface WorkoutStreakCardProps {
  days: StreakDay[];
  activeDayCount: number;
  dateRange: string;
}

const EMOJI_MAP: Record<string, string> = {
  HKWorkoutActivityTypeSwimming: "🏊",
  HKWorkoutActivityTypeRunning: "🏃",
  HKWorkoutActivityTypeCycling: "🚴",
  HKWorkoutActivityTypeTraditionalStrengthTraining: "🏋️",
  HKWorkoutActivityTypeFunctionalStrengthTraining: "🏋️",
  HKWorkoutActivityTypeHiking: "🥾",
  HKWorkoutActivityTypeYoga: "🧘",
  HKWorkoutActivityTypeElliptical: "🏃‍♂️",
  HKWorkoutActivityTypeRowing: "🚣",
  HKWorkoutActivityTypeStairClimbing: "🪜",
  HKWorkoutActivityTypeStairs: "🪜",
  HKWorkoutActivityTypeClimbing: "🧗",
  HKWorkoutActivityTypeHighIntensityIntervalTraining: "🔥",
  HKWorkoutActivityTypeOther: "💪",
};

function getEmoji(type: string): string {
  return EMOJI_MAP[type] || "💪";
}

function formatType(type: string): string {
  return type.replace("HKWorkoutActivityType", "");
}

function isToday(dateStr: string): boolean {
  const now = new Date();
  const [y, m, d] = dateStr.split("-").map(Number);
  return y === now.getFullYear() && m === now.getMonth() + 1 && d === now.getDate();
}

export default function WorkoutStreakCard({
  days,
  activeDayCount,
  dateRange,
}: WorkoutStreakCardProps) {
  const hasStreak = activeDayCount >= 6;

  return (
    <div className={`card-terminal rounded-lg p-5 ${hasStreak ? "streak-card" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-mono">
            workout streak
          </span>
          {hasStreak && (
            <div className="streak-badge-inline">
              <svg className="streak-flame-mini" viewBox="6 0 12 16" fill="none">
                <path
                  d="M12 2C12 2 8 6 8 10C8 12 9 14 12 14C15 14 16 12 16 10C16 6 12 2 12 2Z"
                  fill="url(#streakFlameGrad)"
                />
                <path
                  d="M12 8C12 8 10 10 10 12C10 13 10.5 14 12 14C13.5 14 14 13 14 12C14 10 12 8 12 8Z"
                  fill="#FEF3C7"
                />
                <defs>
                  <linearGradient id="streakFlameGrad" x1="12" y1="2" x2="12" y2="14" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FBBF24" />
                    <stop offset="1" stopColor="#F97316" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="streak-count-mini">{activeDayCount}</span>
            </div>
          )}
        </div>
        <span className="text-[10px] text-zinc-700 font-mono tracking-wider">
          {dateRange}
        </span>
      </div>

      {/* Segments */}
      <div className="flex gap-1.5">
        {days.map((day) => {
          const hasWorkout = day.workouts.length > 0;
          const today = isToday(day.date);
          const multiWorkout = day.workouts.length > 1;

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-2 group relative">
              {/* Tooltip */}
              {hasWorkout && (
                <div className={`absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0 pointer-events-none z-20 ${hasStreak ? "streak-tooltip" : ""}`}>
                  <div className={`rounded-md border px-3 py-2 text-[10px] font-mono whitespace-nowrap shadow-lg ${hasStreak ? "bg-zinc-900/95 border-amber-500/30" : "bg-zinc-900/95 border-emerald-500/30"}`}>
                    {multiWorkout ? (
                      <>
                        <div className={`font-bold mb-1 ${hasStreak ? "text-amber-400" : "text-emerald-400"}`}>
                          {day.workouts.map(w => formatType(w.type)).join(" + ")}
                        </div>
                        <div className="border-t border-zinc-800 my-1" />
                        {day.workouts.map((w, i) => (
                          <div key={i} className="text-zinc-400">
                            <span className="text-zinc-600">{formatType(w.type).toLowerCase()} </span>
                            <span className="text-zinc-100">{w.durationMinutes} min</span>
                            {w.calories && <span className="text-zinc-100"> / {w.calories} kcal</span>}
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        <div className={`font-bold mb-1 ${hasStreak ? "text-amber-400" : "text-emerald-400"}`}>
                          {formatType(day.workouts[0].type)}
                        </div>
                        {day.workouts[0].durationMinutes > 0 && (
                          <div><span className="text-zinc-600">duration </span><span className="text-zinc-100">{day.workouts[0].durationMinutes} min</span></div>
                        )}
                        {day.workouts[0].calories && (
                          <div><span className="text-zinc-600">calories </span><span className="text-zinc-100">{day.workouts[0].calories} kcal</span></div>
                        )}
                        {day.workouts[0].avgHR && (
                          <div><span className="text-zinc-600">avg hr </span><span className="text-zinc-100">{day.workouts[0].avgHR} bpm</span></div>
                        )}
                        {day.workouts[0].distance && day.workouts[0].distance > 0.1 && (
                          <div><span className="text-zinc-600">distance </span><span className="text-zinc-100">{day.workouts[0].distance} mi</span></div>
                        )}
                      </>
                    )}
                  </div>
                  {/* Arrow */}
                  <div className={`w-2 h-2 rotate-45 mx-auto -mt-1 border-r border-b ${hasStreak ? "bg-zinc-900/95 border-amber-500/30" : "bg-zinc-900/95 border-emerald-500/30"}`} />
                </div>
              )}

              {/* Emoji */}
              <div className={`h-8 sm:h-9 flex items-center justify-center ${!hasWorkout ? "opacity-[0.12] grayscale" : ""}`}>
                {hasWorkout ? (
                  multiWorkout ? (
                    <span className="text-[14px] sm:text-[18px] flex gap-0.5">
                      {day.workouts.slice(0, 2).map((w, i) => (
                        <span key={i}>{getEmoji(w.type)}</span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-[22px] sm:text-[28px]">{getEmoji(day.workouts[0].type)}</span>
                  )
                ) : (
                  <span className="text-[22px] sm:text-[28px]">{today && !hasWorkout ? "?" : "–"}</span>
                )}
              </div>

              {/* Day bar */}
              <div
                className={`w-full h-6 rounded flex items-center justify-center font-mono text-[9px] tracking-wider transition-colors ${
                  hasWorkout
                    ? hasStreak
                      ? "bg-gradient-to-b from-amber-500/25 to-amber-500/8 border border-amber-500/40 text-zinc-400"
                      : "bg-gradient-to-b from-emerald-500/25 to-emerald-500/8 border border-emerald-500/40 text-zinc-400"
                    : today
                      ? "border border-dashed border-cyan-400/40 text-cyan-400"
                      : "bg-[#1a1a1e] border border-zinc-800 text-zinc-700"
                }`}
              >
                {day.dayLabel}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/components/WorkoutStreakCard.tsx
git commit -m "add workout streak card component"
```

---

## Task 4: Wire Into Dashboard

**Files:**
- Modify: `dashboard/app/page.tsx`

- [ ] **Step 1: Add import**

Add after line 8 (`import YearComparisonA`):

```typescript
import WorkoutStreakCard from "@/components/WorkoutStreakCard";
```

- [ ] **Step 2: Add interface**

Add after the `ComparisonData` interface (after line 74):

```typescript
interface WorkoutStreakData {
  days: {
    date: string;
    dayLabel: string;
    workouts: {
      type: string;
      durationMinutes: number;
      calories: number | null;
      avgHR: number | null;
      distance: number | null;
    }[];
  }[];
  activeDayCount: number;
  dateRange: string;
}
```

- [ ] **Step 3: Add state**

Add after `comparisonData` state (after line 81):

```typescript
const [workoutStreak, setWorkoutStreak] = useState<WorkoutStreakData | null>(null);
```

- [ ] **Step 4: Add fetch**

In the `Promise.all` block (line 87), add workout-streak to the destructured array and fetch calls:

Change:
```typescript
const [steps, workouts, periods, swimming, comparison] = await Promise.all([
  fetch("/api/health/steps").then((r) => r.json()),
  fetch("/api/health/workouts").then((r) => r.json()),
  fetch("/api/health/periods").then((r) => r.json()),
  fetch("/api/health/swimming").then((r) => r.json()),
  fetch("/api/health/comparison").then((r) => r.json()),
]);
```

To:
```typescript
const [steps, workouts, periods, swimming, comparison, streak] = await Promise.all([
  fetch("/api/health/steps").then((r) => r.json()),
  fetch("/api/health/workouts").then((r) => r.json()),
  fetch("/api/health/periods").then((r) => r.json()),
  fetch("/api/health/swimming").then((r) => r.json()),
  fetch("/api/health/comparison").then((r) => r.json()),
  fetch("/api/health/workout-streak").then((r) => r.json()),
]);
```

Add after `setComparisonData(comparison)` (line 99):

```typescript
setWorkoutStreak(streak);
```

- [ ] **Step 5: Add component render**

Insert after the weekly bar charts closing `</div>` (after line 196), before `{/* Year comparison */}`:

```tsx
{/* Workout streak */}
{workoutStreak && (
  <div className="mb-8 max-w-md mx-auto">
    <div className="reveal reveal-delay-3">
      <WorkoutStreakCard
        days={workoutStreak.days}
        activeDayCount={workoutStreak.activeDayCount}
        dateRange={workoutStreak.dateRange}
      />
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify in browser**

```bash
cd dashboard && npm run dev
```

Open `http://localhost:3000`. Check:
1. Card appears after the steps/energy charts
2. Emoji shows for each workout day
3. Hover tooltips appear with workout details
4. Rest days show dimmed dash
5. Mobile view (375px) segments compress, emoji at 22px
6. If 6+ active days, golden streak treatment activates

- [ ] **Step 7: Commit**

```bash
git add dashboard/app/page.tsx
git commit -m "wire workout streak card into dashboard"
```
