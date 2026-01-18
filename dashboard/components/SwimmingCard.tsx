interface SwimWorkout {
  date: string;
  yards: number;
  duration_mins: number;
  pace_per_100: number;
  avg_hr: number | null;
}

interface SwimmingCardProps {
  years: { year: number; yards: number }[];
  recentSwims?: SwimWorkout[];
}

function formatPace(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function SwimmingCard({ years, recentSwims }: SwimmingCardProps) {
  // Ensure we have entries for 2024, 2025, 2026
  const getYearData = (year: number) => {
    const found = years.find(y => y.year === year);
    return found?.yards || 0;
  };

  const yards2024 = getYearData(2024);
  const yards2025 = getYearData(2025);
  const yards2026 = getYearData(2026);

  const formatYards = (yards: number): string => {
    if (yards === 0) return "0";
    if (yards >= 1000) {
      return `${(yards / 1000).toFixed(1)}k`;
    }
    return yards.toLocaleString();
  };

  return (
    <div className="card-terminal rounded-lg px-5 py-4" style={{ '--corner-color': 'rgba(34, 211, 238, 0.4)' } as React.CSSProperties}>
      {/* Header with icon */}
      <div className="flex items-center gap-3 mb-4">
        <svg
          className="w-6 h-6 text-cyan-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          {/* Swimming person icon */}
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 17.5c1.5 0 2.5-1 4-1s2.5 1 4 1 2.5-1 4-1 2.5 1 4 1M3 21c1.5 0 2.5-1 4-1s2.5 1 4 1 2.5-1 4-1 2.5 1 4 1"
          />
          <circle cx="16" cy="5" r="2" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 13l3-3 2 2 4-5"
          />
        </svg>
        <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">swimming</span>
      </div>

      {/* Year totals */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-zinc-600 uppercase font-mono">2026</span>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold font-mono ${yards2026 > 0 ? 'text-cyan-400 glow-cyan' : 'text-zinc-600'}`}>
              {formatYards(yards2026)}
            </span>
            <span className="text-[10px] text-zinc-600">yd</span>
          </div>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-zinc-600 uppercase font-mono">2025</span>
          <div className="flex items-baseline gap-1">
            <span className={`text-lg font-mono ${yards2025 > 0 ? 'text-zinc-300' : 'text-zinc-600'}`}>
              {formatYards(yards2025)}
            </span>
            <span className="text-[10px] text-zinc-600">yd</span>
          </div>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-zinc-600 uppercase font-mono">2024</span>
          <div className="flex items-baseline gap-1">
            <span className={`text-sm font-mono ${yards2024 > 0 ? 'text-zinc-500' : 'text-zinc-600'}`}>
              {formatYards(yards2024)}
            </span>
            <span className="text-[10px] text-zinc-600">yd</span>
          </div>
        </div>
      </div>

      {/* Recent swims */}
      {recentSwims && recentSwims.length > 0 && (
        <div className="mt-4 pt-3 border-t border-zinc-800/50">
          <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-3">
            Recent swims
          </div>
          <div className="space-y-2.5">
            {recentSwims.slice(0, 3).map((swim, i) => (
              <div key={i} className="flex items-center text-[11px]">
                <span className="text-zinc-500 w-14 shrink-0">
                  {new Date(swim.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="text-zinc-300 font-mono w-12 text-right">
                  {formatYards(swim.yards)}
                </span>
                <span className="text-cyan-400/80 font-mono ml-4">
                  {formatPace(swim.pace_per_100)}/100
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
