"use client";

import { useMemo, useState } from "react";

export type CellStatus = "good" | "ok" | "bad" | "empty";

export interface GridWeek {
  date: string;
  value: number;
  status: CellStatus;
}

interface WeeklyGridProps {
  title: string;
  data: GridWeek[];
  legend: { label: string; status: CellStatus }[];
  formatTooltip?: (week: GridWeek) => string;
}

function getStatusClass(status: CellStatus): string {
  switch (status) {
    case "good":
      return "activity-cell-good";
    case "ok":
      return "activity-cell-ok";
    case "bad":
      return "activity-cell-bad";
    default:
      return "activity-cell-empty";
  }
}

export default function WeeklyGrid({ title, data, legend, formatTooltip }: WeeklyGridProps) {
  const [hoveredWeek, setHoveredWeek] = useState<GridWeek | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const { weeks, dateRange } = useMemo(() => {
    if (data.length === 0) {
      return { weeks: [], dateRange: "" };
    }

    // Sort by date
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));

    const minDate = new Date(sorted[0].date + "T12:00:00");
    const maxDate = new Date(sorted[sorted.length - 1].date + "T12:00:00");

    const range = `${minDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })} - ${maxDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;

    return { weeks: sorted, dateRange: range };
  }, [data]);

  const handleMouseEnter = (week: GridWeek, e: React.MouseEvent) => {
    setHoveredWeek(week);
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    setTooltipPos({
      x: rect.left + scrollX + rect.width / 2,
      y: rect.top + scrollY
    });
  };

  const handleMouseLeave = () => {
    setHoveredWeek(null);
  };

  return (
    <div className="reveal">
      {/* Section header */}
      <div className="flex items-center justify-center gap-3 mb-3">
        <div className="h-px w-12 bg-gradient-to-r from-transparent to-zinc-700" />
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono">
          {title}
        </span>
        <div className="h-px w-12 bg-gradient-to-l from-transparent to-zinc-700" />
      </div>

      {/* Date range */}
      <div className="text-center mb-2">
        <span className="text-[9px] text-zinc-600 font-mono">{dateRange}</span>
      </div>

      {/* Grid container - single row */}
      <div className="flex justify-center pb-2 overflow-x-auto">
        <div className="flex gap-[2px]">
          {weeks.map((week) => (
            <div
              key={week.date}
              className={`
                w-[11px] h-[11px] sm:w-[13px] sm:h-[13px] rounded-[2px]
                transition-all duration-200 cursor-pointer
                ${getStatusClass(week.status)}
                hover:scale-150 hover:z-10
              `}
              onMouseEnter={(e) => handleMouseEnter(week, e)}
              onMouseLeave={handleMouseLeave}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-center items-center gap-4 mt-3">
        {legend.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`w-[10px] h-[10px] rounded-[2px] ${getStatusClass(item.status)}`} />
            <span className="text-[9px] text-zinc-500">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {hoveredWeek && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 shadow-xl whitespace-nowrap">
            <div className="text-[10px] text-zinc-400 font-mono">
              Week of {new Date(hoveredWeek.date + "T12:00:00").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </div>
            <div
              className={`text-[11px] font-medium ${
                hoveredWeek.status === "good"
                  ? "text-emerald-400"
                  : hoveredWeek.status === "ok"
                  ? "text-amber-400"
                  : hoveredWeek.status === "bad"
                  ? "text-red-400"
                  : "text-zinc-500"
              }`}
            >
              {formatTooltip ? formatTooltip(hoveredWeek) : `${hoveredWeek.value}`}
            </div>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-700" />
        </div>
      )}
    </div>
  );
}
