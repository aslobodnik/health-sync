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

  // Check for 6-day streak (all completed days in view met goal)
  const hasStreak = goal && completedDays.length >= 6 && completedDays.slice(-6).every((d) => d.value >= goal);

  // Date range
  const startDate = parseDate(last7[0].date);
  const endDate = parseDate(last7[last7.length - 1].date);
  const dateRange = `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div className={`card-terminal rounded-lg p-5 ${hasStreak ? 'card-terminal-streak' : ''}`}>
      {/* Header */}
      <div className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] mb-1">
        {title}
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-4xl font-bold text-emerald-400 font-mono glow-emerald">
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
              stroke="#52525b"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          )}
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {last7.map((entry, index) => {
              const missedGoal = goal && !entry.isToday && entry.value < goal;
              return (
                <Cell
                  key={`cell-${index}`}
                  fill={missedGoal ? "#b45309" : color}
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
