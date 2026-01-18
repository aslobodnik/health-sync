interface DataPoint {
  date: string;
  value: number;
}

interface VO2MaxMonth {
  month: string;
  value: number;
}

interface VO2MaxData {
  months: VO2MaxMonth[];
}

interface HeartRateCardProps {
  rhr: DataPoint[];
  hrv: DataPoint[];
  vo2max?: VO2MaxData | null;
}

function Sparkline({ data, latest, color = "#10b981" }: { data: DataPoint[]; latest: number; color?: string }) {
  if (data.length === 0) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 180;
  const height = 50;
  const padding = 2;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y =
      height - padding - ((d.value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(" L ")}`;

  return (
    <div className="flex items-center gap-2">
      {/* Y-axis labels */}
      <div className="flex flex-col justify-between h-[50px] text-[9px] font-mono text-zinc-500 w-6 text-right">
        <span>{max}</span>
        <span>{min}</span>
      </div>

      {/* Chart */}
      <svg
        width={width}
        height={height}
        className="overflow-visible"
        viewBox={`0 0 ${width} ${height}`}
      >
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-80"
        />
        <circle
          cx={width - padding}
          cy={height - padding - ((latest - min) / range) * (height - padding * 2)}
          r="3.5"
          fill={color}
          className="pulse-live"
        />
      </svg>

      {/* Current value */}
      <div className="text-right ml-1">
        <div className="text-xl font-bold font-mono leading-none glow-pink" style={{ color }}>
          {latest}
        </div>
      </div>
    </div>
  );
}

function Trend({ data, lowerIsBetter }: { data: DataPoint[]; lowerIsBetter: boolean }) {
  if (data.length < 14) return null;

  const recent = data.slice(-7);
  const prior = data.slice(-14, -7);
  const recentAvg = recent.reduce((a, b) => a + b.value, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b.value, 0) / prior.length;
  const trendPct = ((recentAvg - priorAvg) / priorAvg) * 100;

  if (Math.abs(trendPct) < 2) {
    return <span className="text-zinc-600">~</span>;
  }

  const isImprovement = lowerIsBetter ? trendPct < 0 : trendPct > 0;
  const color = isImprovement ? "text-emerald-500" : "text-red-400";
  const arrow = trendPct > 0 ? "+" : "";

  return (
    <span className={`${color} font-mono text-xs`}>
      {arrow}{trendPct.toFixed(0)}%
    </span>
  );
}

function formatDate(dateStr: string): string {
  // Handle both ISO timestamps and date-only strings
  let date: Date;
  if (dateStr.includes("T")) {
    // ISO timestamp - safe to parse directly
    date = new Date(dateStr);
  } else {
    // Date-only string - parse as local to avoid UTC offset shift
    const [y, m, d] = dateStr.split("-").map(Number);
    date = new Date(y, m - 1, d);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Compare using date strings to handle timezone differences
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (dateOnly.getTime() === today.getTime()) return "today";
  if (dateOnly.getTime() === yesterday.getTime()) return "yesterday";

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function VO2Timeline({ months }: { months: VO2MaxMonth[] }) {
  if (months.length === 0) return null;

  return (
    <div className="flex items-center justify-between">
      {months.map((m, i) => {
        const isLatest = i === 0;
        return (
          <div key={m.month} className="flex flex-col items-center gap-0.5">
            <span
              className={`text-sm font-mono tabular-nums ${
                isLatest ? "text-cyan-400" : "text-zinc-500"
              }`}
            >
              {m.value}
            </span>
            <span
              className={`text-[9px] uppercase tracking-wider ${
                isLatest ? "text-cyan-400/70" : "text-zinc-600"
              }`}
            >
              {m.month}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function HeartRateCard({ rhr, hrv, vo2max }: HeartRateCardProps) {
  if (rhr.length === 0 && hrv.length === 0) return null;

  const latestRhr = rhr[rhr.length - 1]?.value ?? 0;
  const latestHrv = hrv[hrv.length - 1]?.value ?? 0;
  const latestRhrDate = rhr[rhr.length - 1]?.date ?? "";
  const latestHrvDate = hrv[hrv.length - 1]?.date ?? "";

  return (
    <div className="card-terminal rounded-lg p-4" style={{ '--corner-color': 'rgba(244, 114, 182, 0.4)' } as React.CSSProperties}>
      {/* RHR */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] text-zinc-500 uppercase tracking-[0.15em]">
          resting hr <span className="text-zinc-600">({formatDate(latestRhrDate)})</span>
        </div>
        <Trend data={rhr} lowerIsBetter={true} />
      </div>
      <Sparkline data={rhr} latest={latestRhr} color="#f472b6" />

      {/* Divider */}
      <div className="divider-glow my-3" style={{ background: 'linear-gradient(90deg, transparent, rgba(244, 114, 182, 0.3), transparent)' }} />

      {/* HRV */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] text-zinc-500 uppercase tracking-[0.15em]">
          hrv <span className="text-zinc-600">({formatDate(latestHrvDate)})</span>
        </div>
        <Trend data={hrv} lowerIsBetter={false} />
      </div>
      <Sparkline data={hrv} latest={latestHrv} color="#f472b6" />

      {/* VO2 Max - 3-month timeline */}
      {vo2max && vo2max.months.length > 0 && (
        <>
          <div className="divider-glow my-3" style={{ background: 'linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.15), transparent)' }} />
          <div className="text-[10px] text-zinc-600 uppercase tracking-[0.15em] text-center mb-2">
            vo₂ max
          </div>
          <VO2Timeline months={vo2max.months} />
        </>
      )}
    </div>
  );
}
