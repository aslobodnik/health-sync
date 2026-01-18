"use client";

import { useMemo, useState } from "react";

export type CellStatus = "good" | "ok" | "bad" | "empty";

export interface GridDay {
  date: string;
  value: number;
  status: CellStatus;
}

interface ActivityGridProps {
  title: string;
  data: GridDay[];
  legend: { label: string; status: CellStatus }[];
  formatTooltip?: (day: GridDay) => string;
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

export default function ActivityGrid({ title, data, legend, formatTooltip }: ActivityGridProps) {
  const [hoveredDay, setHoveredDay] = useState<GridDay | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const { weeks, dateRange } = useMemo(() => {
    if (data.length === 0) {
      return { weeks: [], dateRange: "" };
    }

    // Create a map for quick lookup
    const dataMap = new Map(data.map(d => [d.date, d]));

    // Get date range
    const dates = data.map(d => new Date(d.date + "T12:00:00"));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

    // Build weeks grid
    const weeksArr: (GridDay | null)[][] = [];
    const currentDate = new Date(minDate);

    // Adjust to start of week (Sunday)
    const startDayOfWeek = currentDate.getDay();
    currentDate.setDate(currentDate.getDate() - startDayOfWeek);

    while (currentDate <= maxDate) {
      const week: (GridDay | null)[] = [];
      for (let i = 0; i < 7; i++) {
        const dateStr = currentDate.toISOString().split("T")[0];
        const dayData = dataMap.get(dateStr);
        if (dayData) {
          week.push(dayData);
        } else if (currentDate >= minDate && currentDate <= maxDate) {
          week.push({ date: dateStr, value: 0, status: "empty" });
        } else {
          week.push(null);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      weeksArr.push(week);
    }

    const range = `${minDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${maxDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

    return { weeks: weeksArr, dateRange: range };
  }, [data]);

  const handleMouseEnter = (day: GridDay, e: React.MouseEvent) => {
    setHoveredDay(day);
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    setTooltipPos({
      x: rect.left + scrollX + rect.width / 2,
      y: rect.top + scrollY
    });
  };

  const handleMouseLeave = () => {
    setHoveredDay(null);
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

      {/* Grid container */}
      <div className="flex justify-center pb-2 overflow-x-auto">
        <div className="inline-flex gap-3 relative">
          {/* Day labels */}
          <div className="flex flex-col gap-[3px] pt-0">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="h-[11px] sm:h-[13px] flex items-center">
                <span className="text-[8px] text-zinc-600 w-3 text-right font-mono">{d}</span>
              </div>
            ))}
          </div>

          {/* Weekly columns */}
          <div className="flex gap-[2px]">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-[2px]">
                {week.map((day, dayIndex) => {
                  if (!day) {
                    return <div key={dayIndex} className="w-[11px] h-[11px] sm:w-[13px] sm:h-[13px]" />;
                  }
                  return (
                    <div
                      key={day.date}
                      className={`
                        w-[11px] h-[11px] sm:w-[13px] sm:h-[13px] rounded-[2px]
                        transition-all duration-200 cursor-pointer
                        ${getStatusClass(day.status)}
                        hover:scale-150 hover:z-10
                      `}
                      onMouseEnter={(e) => handleMouseEnter(day, e)}
                      onMouseLeave={handleMouseLeave}
                    />
                  );
                })}
              </div>
            ))}
          </div>
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
      {hoveredDay && (
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
              {new Date(hoveredDay.date + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </div>
            <div
              className={`text-[11px] font-medium ${
                hoveredDay.status === "good"
                  ? "text-emerald-400"
                  : hoveredDay.status === "ok"
                  ? "text-amber-400"
                  : hoveredDay.status === "bad"
                  ? "text-red-400"
                  : "text-zinc-500"
              }`}
            >
              {formatTooltip ? formatTooltip(hoveredDay) : `${hoveredDay.value}`}
            </div>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-700" />
        </div>
      )}
    </div>
  );
}
