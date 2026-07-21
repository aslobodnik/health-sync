import { getWorkoutStreak } from "./queries";
import { formatShortDate, parseLocalDate, todayET } from "./dates";

export interface WorkoutDetail {
  type: string;
  durationMinutes: number;
  calories: number | null;
  avgHR: number | null;
  distance: number | null;
}

export interface StreakDay {
  date: string;
  dayLabel: string;
  workouts: WorkoutDetail[];
}

export interface WorkoutStreakData {
  days: StreakDay[];
  activeDayCount: number;
  dateRange: string;
}

// Shape the last 7 ET days (today inclusive) with their workouts
export async function getWorkoutStreakData(): Promise<WorkoutStreakData> {
  const rows = await getWorkoutStreak();
  const todayDate = parseLocalDate(todayET());

  const days: StreakDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayLabel = d
      .toLocaleDateString("en-US", { weekday: "short" })
      .toUpperCase();

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
  const start = days[0].date;
  const dateRange = `${formatShortDate(start).toLowerCase()} – ${formatShortDate(days[6].date).toLowerCase()}`;

  return { days, activeDayCount, dateRange };
}
