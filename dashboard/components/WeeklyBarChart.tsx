import StreakBadge from "./StreakBadge";
import { formatCompact } from "@/lib/format";
import { formatShortDate, isTodayET, weekdayShort } from "@/lib/dates";

interface DayData {
  date: string;
  value: number;
}

interface WeeklyBarChartProps {
  title: string;
  data: DayData[];
  unit: string;
  color?: string;
  goal?: number;
}

const CHART_HEIGHT = 124;

export default function WeeklyBarChart({
  title,
  data,
  unit,
  color = "#10b981",
  goal,
}: WeeklyBarChartProps) {
  const last7 = data.slice(-7).map((d) => ({
    ...d,
    day: weekdayShort(d.date),
    label: formatCompact(d.value),
    isToday: isTodayET(d.date),
  }));

  if (last7.length === 0) return null;

  // Exclude today from average since it's in progress
  const completedDays = last7.filter((d) => !d.isToday);
  const values = last7.map((d) => d.value);
  const max = Math.max(...values, goal ?? 0);
  const scaleMax = max * 1.15 || 1;
  const avg =
    completedDays.length > 0
      ? Math.round(
          completedDays.reduce((a, b) => a + b.value, 0) / completedDays.length,
        )
      : 0;

  // Consecutive goal-meeting days, counted back from most recent completed day
  let streakCount = 0;
  if (goal) {
    for (let i = completedDays.length - 1; i >= 0; i--) {
      if (completedDays[i].value >= goal) {
        streakCount++;
      } else {
        break;
      }
    }
  }
  const hasStreak = streakCount >= 6;

  const dateRange = `${formatShortDate(last7[0].date)} - ${formatShortDate(last7[last7.length - 1].date)}`;

  return (
    <div
      className={`card-terminal rounded-lg p-5 ${hasStreak ? "streak-card" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] text-zinc-500 uppercase tracking-[0.15em]">
          {title}
        </div>
        {hasStreak && <StreakBadge count={streakCount} />}
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span
          className={`text-4xl font-bold font-mono ${hasStreak ? "streak-glow text-amber-400" : "glow-emerald text-emerald-400"}`}
        >
          {formatCompact(avg)}
        </span>
        <span className="text-sm text-zinc-500">{unit}</span>
        <span className="text-xs text-zinc-600">avg</span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-zinc-600 mb-4">
        <span>{dateRange}</span>
        {goal && (
          <span className="flex items-center gap-1.5 text-zinc-500">
            <span className="w-3 h-px border-t border-dashed border-zinc-500" />
            {formatCompact(goal)} goal
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="relative" style={{ height: CHART_HEIGHT }}>
        {/* Goal line */}
        {goal && (
          <div
            className="absolute inset-x-0 border-t border-dashed"
            style={{
              bottom: (goal / scaleMax) * CHART_HEIGHT,
              borderColor: hasStreak ? "#d97706" : "#52525b",
            }}
          />
        )}
        {/* Bars */}
        <div className="absolute inset-0 flex items-end justify-between gap-2">
          {last7.map((entry) => {
            const missedGoal = goal && !entry.isToday && entry.value < goal;
            const streakBar = hasStreak && !missedGoal;
            const barHeight = Math.max((entry.value / scaleMax) * CHART_HEIGHT, 1);
            return (
              <div
                key={entry.date}
                className="flex-1 max-w-10 flex flex-col items-center justify-end gap-1.5"
              >
                <span className="text-[10px] text-zinc-400 font-mono leading-none">
                  {entry.label}
                </span>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: barHeight,
                    backgroundColor: missedGoal
                      ? "#b45309"
                      : streakBar
                        ? "#f59e0b"
                        : color,
                    opacity: missedGoal ? 0.5 : 0.85,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekday labels */}
      <div className="flex justify-between gap-2 mt-2">
        {last7.map((entry) => (
          <span
            key={entry.date}
            className="flex-1 max-w-10 text-center text-[10px] text-[#71717a]"
          >
            {entry.day}
          </span>
        ))}
      </div>
    </div>
  );
}
