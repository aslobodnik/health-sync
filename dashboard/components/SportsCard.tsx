interface SportsCardProps {
  sport: "running" | "swimming" | "cycling";
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  distanceThisWeek: number;
  distanceLastWeek: number;
  distanceUnit: string;
  totalYTD: number;
}

const sportIcons: Record<string, string> = {
  running: "🏃",
  swimming: "🏊",
  cycling: "🚴",
};

function formatChange(current: number, previous: number): { text: string; isPositive: boolean | null } {
  if (previous === 0) {
    if (current === 0) return { text: "—", isPositive: null };
    return { text: `+${current}`, isPositive: true };
  }
  const diff = current - previous;
  if (diff === 0) return { text: "—", isPositive: null };
  const sign = diff > 0 ? "+" : "";
  return { text: `${sign}${diff}`, isPositive: diff > 0 };
}

function formatDistanceChange(current: number, previous: number): { text: string; isPositive: boolean | null } {
  if (previous === 0) {
    if (current === 0) return { text: "—", isPositive: null };
    return { text: `+${current.toFixed(1)}`, isPositive: true };
  }
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return { text: "—", isPositive: null };
  const sign = diff > 0 ? "+" : "";
  return { text: `${sign}${diff.toFixed(1)}`, isPositive: diff > 0 };
}

export default function SportsCard({
  sport,
  sessionsThisWeek,
  sessionsLastWeek,
  distanceThisWeek,
  distanceLastWeek,
  distanceUnit,
  totalYTD,
}: SportsCardProps) {
  const icon = sportIcons[sport] || "🏋️";
  const sessionChange = formatChange(sessionsThisWeek, sessionsLastWeek);
  const distanceChange = formatDistanceChange(distanceThisWeek, distanceLastWeek);

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-lg px-4 sm:px-6 py-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <span className="text-xs uppercase tracking-wider text-zinc-400 capitalize">{sport}</span>
      </div>

      {/* This week stats */}
      <div className="space-y-2">
        {/* Sessions */}
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-zinc-600 uppercase">Sessions</span>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-zinc-100 font-mono">{sessionsThisWeek}</span>
            <span
              className={`text-[10px] font-mono ${
                sessionChange.isPositive === null
                  ? "text-zinc-600"
                  : sessionChange.isPositive
                  ? "text-emerald-500"
                  : "text-red-500"
              }`}
            >
              {sessionChange.text}
            </span>
          </div>
        </div>

        {/* Distance */}
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-zinc-600 uppercase">Distance</span>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-zinc-100 font-mono">
              {distanceThisWeek.toFixed(1)}
            </span>
            <span className="text-xs text-zinc-500">{distanceUnit}</span>
            <span
              className={`text-[10px] font-mono ${
                distanceChange.isPositive === null
                  ? "text-zinc-600"
                  : distanceChange.isPositive
                  ? "text-emerald-500"
                  : "text-red-500"
              }`}
            >
              {distanceChange.text}
            </span>
          </div>
        </div>
      </div>

      {/* YTD */}
      <div className="mt-3 pt-3 border-t border-zinc-800/50">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-zinc-600 uppercase">YTD Total</span>
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-mono text-zinc-400">{totalYTD.toFixed(1)}</span>
            <span className="text-[10px] text-zinc-600">{distanceUnit}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
