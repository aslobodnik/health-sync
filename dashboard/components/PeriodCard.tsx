interface PeriodCardProps {
  label: string;
  mtd: number;
  mtdPrior: number;
  ytd: number;
  ytdPrior: number;
  unit?: string;
}

function calculateChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function formatPercent(pct: number | null): string {
  if (pct === null) return "";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

function getChangeColor(pct: number | null): string {
  if (pct === null || Math.abs(pct) < 1) return "text-zinc-600";
  return pct > 0 ? "text-emerald-500" : "text-red-400";
}

// Format numbers in compact form: 163K, 12.2K, 1.2M
function formatCompact(n: number): string {
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (n >= 10_000) {
    return Math.round(n / 1000) + "K";
  }
  if (n >= 1_000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return n.toLocaleString();
}

interface BarPairProps {
  label: string;
  current: number;
  prior: number;
  change: number | null;
}

function BarPair({ label, current, prior, change }: BarPairProps) {
  const max = Math.max(current, prior);
  const currentPct = max > 0 ? (current / max) * 100 : 0;
  const priorPct = max > 0 ? (prior / max) * 100 : 0;
  const barHeight = 48;

  return (
    <div className="flex flex-col items-center">
      <div className="text-[10px] text-zinc-600 uppercase mb-2">{label}</div>

      {/* Vertical bars container */}
      <div className="flex items-end gap-1.5" style={{ height: barHeight }}>
        {/* Prior year bar */}
        <div className="flex flex-col items-center">
          <div
            className="w-4 bg-zinc-700/60 rounded-sm"
            style={{ height: `${(priorPct / 100) * barHeight}px` }}
          />
        </div>
        {/* Current year bar */}
        <div className="flex flex-col items-center">
          <div
            className="w-4 bg-emerald-500/80 rounded-sm"
            style={{ height: `${(currentPct / 100) * barHeight}px` }}
          />
        </div>
      </div>

      {/* Values */}
      <div className="mt-2 text-center">
        <div className="text-sm font-mono text-zinc-200">
          {formatCompact(current)}
        </div>
        <div className="text-[10px] text-zinc-500 font-mono">
          vs {formatCompact(prior)}
        </div>
        <div className={`text-[10px] font-mono ${getChangeColor(change)}`}>
          {formatPercent(change)}
        </div>
      </div>
    </div>
  );
}

export default function PeriodCard({
  label,
  mtd,
  mtdPrior,
  ytd,
  ytdPrior,
  unit,
}: PeriodCardProps) {
  const mtdChange = calculateChange(mtd, mtdPrior);
  const ytdChange = calculateChange(ytd, ytdPrior);

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-lg px-5 py-4">
      {/* Label */}
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3 text-center">
        {label}
        {unit && <span className="text-zinc-600 ml-1">({unit})</span>}
      </div>

      {/* Bar pairs */}
      <div className="flex justify-center gap-8">
        <BarPair label="MTD" current={mtd} prior={mtdPrior} change={mtdChange} />
        <BarPair label="YTD" current={ytd} prior={ytdPrior} change={ytdChange} />
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-4 mt-3 text-[9px] text-zinc-600">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 bg-emerald-500/80 rounded-sm" /> 2026
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 bg-zinc-700/60 rounded-sm" /> 2025
        </span>
      </div>
    </div>
  );
}
