"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface CumulativeData {
  day: number;
  label: string;
  thisYear: number;
  lastYear: number;
}

interface YearComparisonProps {
  stepsCumulative: CumulativeData[];
  energyCumulative: CumulativeData[];
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (n >= 10_000) {
    return Math.round(n / 1000) + "k";
  }
  if (n >= 1_000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return n.toLocaleString();
}

function CumulativeLineChart({
  data,
  title,
  unit,
}: {
  data: CumulativeData[];
  title: string;
  unit?: string;
}) {
  if (data.length === 0) return null;

  const latest = data[data.length - 1];
  const daysCount = data.length;
  const avgThisYear = Math.round(latest.thisYear / daysCount);
  const avgLastYear = latest.lastYear > 0 ? Math.round(latest.lastYear / daysCount) : 0;
  const pctAhead = avgLastYear > 0
    ? ((avgThisYear - avgLastYear) / avgLastYear) * 100
    : 0;

  const chartId = title.replace(/\s+/g, '-');

  return (
    <div className="card-terminal rounded-lg p-5">
      <div className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] mb-1">
        {title}
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-4xl font-bold text-emerald-400 font-mono glow-emerald">
          {formatCompact(avgThisYear)}
        </span>
        {unit && <span className="text-sm text-zinc-500">{unit}</span>}
        <span className="text-xs text-zinc-600">avg/day</span>
        <span className={`text-sm font-mono ${pctAhead >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
          {pctAhead >= 0 ? '+' : ''}{pctAhead.toFixed(0)}%
        </span>
      </div>
      <div className="text-[11px] text-zinc-600 mb-4">
        Jan 1 - {latest.label}
      </div>

      <ResponsiveContainer width="100%" height={120}>
        <AreaChart
          data={data}
          margin={{ top: 5, right: 5, left: 5, bottom: 0 }}
        >
          <defs>
            <linearGradient id={`gradient-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#71717a", fontSize: 10 }}
            interval="preserveStartEnd"
            minTickGap={50}
          />
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "6px",
              fontSize: "11px"
            }}
            formatter={(value, name) => [
              formatCompact(value as number) + (unit ? ` ${unit}` : ""),
              name === "thisYear" ? "2026" : "2025"
            ]}
            labelStyle={{ color: "#a1a1aa" }}
          />
          <Area
            type="monotone"
            dataKey="lastYear"
            stroke="#52525b"
            strokeWidth={1.5}
            fill="transparent"
            name="2025"
          />
          <Area
            type="monotone"
            dataKey="thisYear"
            stroke="#10b981"
            strokeWidth={2}
            fill={`url(#gradient-${chartId})`}
            name="2026"
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex justify-center gap-4 mt-2 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-emerald-500 rounded" /> 2026
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-zinc-600 rounded" /> 2025
        </span>
      </div>
    </div>
  );
}

export default function YearComparison({ stepsCumulative, energyCumulative }: YearComparisonProps) {
  return (
    <div className="flex flex-col gap-4">
      <CumulativeLineChart data={stepsCumulative} title="steps ytd" />
      <CumulativeLineChart data={energyCumulative} title="calories ytd" unit="kcal" />
    </div>
  );
}
