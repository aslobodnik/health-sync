"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  LabelList,
  ReferenceLine,
} from "recharts";

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

function formatCompact(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return k >= 10 ? Math.round(k) + "k" : k.toFixed(1).replace(/\.0$/, "") + "k";
  }
  return n.toString();
}

export default function WeeklyBarChart({
  title,
  data,
  unit,
  color = "#10b981",
  goal,
}: WeeklyBarChartProps) {
  // Parse date string handling both ISO timestamps and date-only strings
  const parseDate = (dateStr: string) => {
    if (dateStr.includes("T")) {
      return new Date(dateStr);
    }
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  // Get last 7 days of data
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const last7 = data.slice(-7).map((d) => {
    const date = parseDate(d.date);
    date.setHours(0, 0, 0, 0);
    const isToday = date.getTime() === today.getTime();
    return {
      ...d,
      day: date.toLocaleDateString("en-US", { weekday: "short" }),
      label: formatCompact(d.value),
      isToday,
    };
  });

  if (last7.length === 0) return null;

  // Exclude today from average since it's in progress
  const completedDays = last7.filter((d) => !d.isToday);
  const values = last7.map((d) => d.value);
  const max = Math.max(...values, goal ?? 0);
  const avg = completedDays.length > 0
    ? Math.round(completedDays.reduce((a, b) => a + b.value, 0) / completedDays.length)
    : 0;

  // Calculate actual streak length by counting consecutive goal-meeting days from most recent
  let streakCount = 0;
  if (goal) {
    // Count backwards from the most recent completed day
    for (let i = completedDays.length - 1; i >= 0; i--) {
      if (completedDays[i].value >= goal) {
        streakCount++;
      } else {
        break;
      }
    }
  }
  const hasStreak = streakCount >= 6;

  // Date range
  const startDate = parseDate(last7[0].date);
  const endDate = parseDate(last7[last7.length - 1].date);
  const dateRange = `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div className={`card-terminal rounded-lg p-5 ${hasStreak ? 'streak-card' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] text-zinc-500 uppercase tracking-[0.15em]">
          {title}
        </div>
        {/* Streak badge - compact inline */}
        {hasStreak && (
          <div className="streak-badge-inline">
            <svg className="streak-flame-mini" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C12 2 8 6 8 10C8 12 9 14 12 14C15 14 16 12 16 10C16 6 12 2 12 2Z" fill="url(#flameGradMini)" />
              <path d="M12 8C12 8 10 10 10 12C10 13 10.5 14 12 14C13.5 14 14 13 14 12C14 10 12 8 12 8Z" fill="#FEF3C7" />
              <defs>
                <linearGradient id="flameGradMini" x1="12" y1="2" x2="12" y2="14" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#FBBF24" />
                  <stop offset="1" stopColor="#F97316" />
                </linearGradient>
              </defs>
            </svg>
            <span className="streak-count-mini">{streakCount}</span>
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className={`text-4xl font-bold font-mono ${hasStreak ? 'streak-glow text-amber-400' : 'glow-emerald text-emerald-400'}`}>
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
      <ResponsiveContainer width="100%" height={144}>
        <BarChart
          data={last7}
          margin={{ top: 20, right: 5, left: 5, bottom: 0 }}
        >
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#71717a", fontSize: 10 }}
            dy={8}
          />
          <YAxis hide domain={[0, max * 1.15]} />
          {goal && (
            <ReferenceLine
              y={goal}
              stroke={hasStreak ? "#d97706" : "#52525b"}
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          )}
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {last7.map((entry, index) => {
              const missedGoal = goal && !entry.isToday && entry.value < goal;
              const streakBar = hasStreak && !missedGoal;
              return (
                <Cell
                  key={`cell-${index}`}
                  fill={missedGoal ? "#b45309" : streakBar ? "#f59e0b" : color}
                  fillOpacity={missedGoal ? 0.5 : 0.85}
                />
              );
            })}
            <LabelList
              dataKey="label"
              position="top"
              fill="#a1a1aa"
              fontSize={10}
              offset={6}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
