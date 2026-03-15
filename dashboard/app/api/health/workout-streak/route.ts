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

    // Build 7-day array (today and 6 days prior) in Eastern time
    const eastern = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = eastern.formatToParts(new Date());
    const todayYear = Number(parts.find((p) => p.type === "year")!.value);
    const todayMonth = Number(parts.find((p) => p.type === "month")!.value) - 1;
    const todayDay = Number(parts.find((p) => p.type === "day")!.value);
    const todayDate = new Date(todayYear, todayMonth, todayDay);

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
          calories: r.total_energy_burned
            ? Math.round(r.total_energy_burned)
            : null,
          avgHR: r.avg_heart_rate ? Math.round(r.avg_heart_rate) : null,
          distance: r.total_distance
            ? Math.round(r.total_distance * 10) / 10
            : null,
        }));

      days.push({ date: dateStr, dayLabel, workouts: dayWorkouts });
    }

    const activeDayCount = days.filter((d) => d.workouts.length > 0).length;

    const start = new Date(todayDate);
    start.setDate(start.getDate() - 6);
    const fmt = (d: Date) =>
      d
        .toLocaleDateString("en-US", { month: "short", day: "numeric" })
        .toLowerCase();
    const dateRange = `${fmt(start)} – ${fmt(todayDate)}`;

    return NextResponse.json({ days, activeDayCount, dateRange });
  } catch (error) {
    console.error("Error fetching workout streak:", error);
    return NextResponse.json(
      { error: "Failed to fetch workout streak data" },
      { status: 500 },
    );
  }
}
