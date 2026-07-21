import type { PeriodComparison } from "@/lib/queries";
import { formatCompact } from "@/lib/format";
import { dayOfYearET, formatShortDate, todayET } from "@/lib/dates";

interface Props {
  steps: PeriodComparison | null;
  energy: PeriodComparison | null;
}

function PaceBar({
  data,
  title,
  unit,
}: {
  data: PeriodComparison | null;
  title: string;
  unit?: string;
}) {
  if (!data) return null;

  const days = dayOfYearET();
  const thisYear = Number(data.ytd);
  const lastYear = Number(data.ytd_prior);
  const avgThis = Math.round(thisYear / days);
  const avgLast = lastYear > 0 ? Math.round(lastYear / days) : 0;
  const pct = avgLast > 0 ? ((avgThis - avgLast) / avgLast) * 100 : 0;
  const ahead = avgThis >= avgLast;

  const max = Math.max(avgThis, avgLast) * 1.12;
  const thisPct = max > 0 ? (avgThis / max) * 100 : 0;
  const lastPct = max > 0 ? (avgLast / max) * 100 : 0;

  const thisYearLabel = new Date().getFullYear();

  return (
    <div className="card-terminal rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] text-zinc-500 uppercase tracking-[0.15em]">
          {title}
        </div>
        <div className="text-[10px] text-zinc-600">
          Jan 1 &ndash; {formatShortDate(todayET())}
        </div>
      </div>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-3xl font-bold text-emerald-400 font-mono glow-emerald">
          {formatCompact(avgThis)}
        </span>
        {unit && <span className="text-sm text-zinc-500">{unit}</span>}
        <span className="text-xs text-zinc-600">avg/day</span>
        <span className="text-[11px] text-zinc-600 font-mono ml-auto">
          {formatCompact(Math.round(thisYear))} total
        </span>
        <span
          className={`text-sm font-mono ${pct >= 0 ? "text-emerald-500" : "text-red-400"}`}
        >
          {pct >= 0 ? "+" : ""}
          {pct.toFixed(0)}%
        </span>
      </div>

      {/* Pace bar */}
      <div className="relative h-5 bg-zinc-800/60 rounded-sm mb-1">
        <div
          className={`absolute inset-y-0 left-0 rounded-sm ${ahead ? "bg-emerald-500/25" : "bg-red-500/20"}`}
          style={{ width: `${thisPct}%` }}
        />
        {avgLast > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-zinc-400/70"
            style={{ left: `${lastPct}%` }}
          />
        )}
      </div>

      {/* Marker label */}
      <div className="relative h-4 text-[9px] font-mono">
        {avgLast > 0 && (
          <div
            className="absolute text-zinc-500"
            style={{
              left: `${lastPct}%`,
              transform: "translateX(-50%)",
            }}
          >
            {thisYearLabel - 1}: {formatCompact(avgLast)}
          </div>
        )}
      </div>

      <div className="flex gap-4 mt-1 text-[9px] text-zinc-600">
        <span className="flex items-center gap-1.5">
          <span
            className={`w-3 h-2 rounded-sm ${ahead ? "bg-emerald-500/25" : "bg-red-500/20"}`}
          />{" "}
          {thisYearLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-px h-3 bg-zinc-400/70" /> {thisYearLabel - 1} pace
        </span>
      </div>
    </div>
  );
}

export default function YearComparisonA({ steps, energy }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <PaceBar data={steps} title="steps ytd" />
      <PaceBar data={energy} title="calories ytd" unit="kcal" />
    </div>
  );
}
