interface ComparisonCardProps {
  label: string;
  thisWeek: number;
  lastWeek: number;
  thisMonth: number;
  lastMonth: number;
  unit?: string;
  formatValue?: (n: number) => string;
  higherIsBetter?: boolean;
}

function calculateChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function formatPercent(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

export default function ComparisonCard({
  label,
  thisWeek,
  lastWeek,
  thisMonth,
  lastMonth,
  unit,
  formatValue = (n) => n.toLocaleString(),
  higherIsBetter = true,
}: ComparisonCardProps) {
  const weekChange = calculateChange(thisWeek, lastWeek);
  const monthChange = calculateChange(thisMonth, lastMonth);

  const getChangeColor = (pct: number | null): string => {
    if (pct === null || Math.abs(pct) < 1) return "text-zinc-600";
    const isImprovement = higherIsBetter ? pct > 0 : pct < 0;
    return isImprovement ? "text-emerald-500" : "text-red-500";
  };

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-lg px-4 sm:px-6 py-4">
      {/* Label */}
      <div className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider mb-3">
        {label}
      </div>

      {/* Weekly comparison */}
      <div className="mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-zinc-100 font-mono">
            {formatValue(thisWeek)}
          </span>
          {unit && <span className="text-xs text-zinc-500">{unit}</span>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-zinc-600">vs {formatValue(lastWeek)} last week</span>
          <span className={`text-[10px] font-mono ${getChangeColor(weekChange)}`}>
            {formatPercent(weekChange)}
          </span>
        </div>
      </div>

      {/* Monthly comparison */}
      <div className="pt-3 border-t border-zinc-800/50">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-zinc-600 uppercase">This month</span>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-mono text-zinc-400">
              {formatValue(thisMonth)}
            </span>
            {unit && <span className="text-[10px] text-zinc-600">{unit}</span>}
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-zinc-600">vs {formatValue(lastMonth)} last month</span>
          <span className={`text-[10px] font-mono ${getChangeColor(monthChange)}`}>
            {formatPercent(monthChange)}
          </span>
        </div>
      </div>
    </div>
  );
}
