import StreakBadge from "./StreakBadge";
import { workoutEmoji, workoutLabel } from "@/lib/workoutTypes";
import { isTodayET } from "@/lib/dates";
import type { StreakDay } from "@/lib/workoutStreak";

interface WorkoutStreakCardProps {
  days: StreakDay[];
  activeDayCount: number;
  dateRange: string;
}

export default function WorkoutStreakCard({
  days,
  activeDayCount,
  dateRange,
}: WorkoutStreakCardProps) {
  const hasStreak = activeDayCount >= 6;

  return (
    <div
      className={`card-terminal rounded-lg p-5 ${hasStreak ? "streak-card" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-mono">
            workout streak
          </span>
          {hasStreak && <StreakBadge count={activeDayCount} />}
        </div>
        <span className="text-[10px] text-zinc-700 font-mono tracking-wider">
          {dateRange}
        </span>
      </div>

      {/* Segments */}
      <div className="flex gap-1.5">
        {days.map((day) => {
          const hasWorkout = day.workouts.length > 0;
          const today = isTodayET(day.date);
          const multiWorkout = day.workouts.length > 1;

          return (
            <div
              key={day.date}
              className="flex-1 flex flex-col items-center gap-2 group relative"
            >
              {/* Tooltip */}
              {hasWorkout && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0 pointer-events-none z-20">
                  <div
                    className={`rounded-md border px-3 py-2 text-[10px] font-mono whitespace-nowrap shadow-lg ${
                      hasStreak
                        ? "bg-zinc-900/95 border-amber-500/30"
                        : "bg-zinc-900/95 border-emerald-500/30"
                    }`}
                  >
                    {multiWorkout ? (
                      <>
                        <div
                          className={`font-bold mb-1 ${hasStreak ? "text-amber-400" : "text-emerald-400"}`}
                        >
                          {day.workouts
                            .map((w) => workoutLabel(w.type))
                            .join(" + ")}
                        </div>
                        <div className="border-t border-zinc-800 my-1" />
                        {day.workouts.map((w, i) => (
                          <div key={i} className="text-zinc-400">
                            <span className="text-zinc-600">
                              {workoutLabel(w.type).toLowerCase()}{" "}
                            </span>
                            <span className="text-zinc-100">
                              {w.durationMinutes} min
                            </span>
                            {w.calories && (
                              <span className="text-zinc-100">
                                {" "}
                                / {w.calories} kcal
                              </span>
                            )}
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        <div
                          className={`font-bold mb-1 ${hasStreak ? "text-amber-400" : "text-emerald-400"}`}
                        >
                          {workoutLabel(day.workouts[0].type)}
                        </div>
                        {day.workouts[0].durationMinutes > 0 && (
                          <div>
                            <span className="text-zinc-600">duration </span>
                            <span className="text-zinc-100">
                              {day.workouts[0].durationMinutes} min
                            </span>
                          </div>
                        )}
                        {day.workouts[0].calories && (
                          <div>
                            <span className="text-zinc-600">calories </span>
                            <span className="text-zinc-100">
                              {day.workouts[0].calories} kcal
                            </span>
                          </div>
                        )}
                        {day.workouts[0].avgHR && (
                          <div>
                            <span className="text-zinc-600">avg hr </span>
                            <span className="text-zinc-100">
                              {day.workouts[0].avgHR} bpm
                            </span>
                          </div>
                        )}
                        {day.workouts[0].distance &&
                          day.workouts[0].distance > 0.1 && (
                            <div>
                              <span className="text-zinc-600">distance </span>
                              <span className="text-zinc-100">
                                {day.workouts[0].distance} mi
                              </span>
                            </div>
                          )}
                      </>
                    )}
                  </div>
                  {/* Arrow */}
                  <div
                    className={`w-2 h-2 rotate-45 mx-auto -mt-1 border-r border-b ${
                      hasStreak
                        ? "bg-zinc-900/95 border-amber-500/30"
                        : "bg-zinc-900/95 border-emerald-500/30"
                    }`}
                  />
                </div>
              )}

              {/* Emoji */}
              <div
                className={`h-8 sm:h-9 flex items-center justify-center ${!hasWorkout ? "opacity-[0.12] grayscale" : ""}`}
              >
                {hasWorkout ? (
                  multiWorkout ? (
                    <span className="text-[14px] sm:text-[18px] flex gap-0.5">
                      {day.workouts.slice(0, 2).map((w, i) => (
                        <span key={i}>{workoutEmoji(w.type)}</span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-[22px] sm:text-[28px]">
                      {workoutEmoji(day.workouts[0].type)}
                    </span>
                  )
                ) : (
                  <span className="text-[22px] sm:text-[28px]">
                    {today ? "?" : "\u2013"}
                  </span>
                )}
              </div>

              {/* Day bar */}
              <div
                className={`w-full h-6 rounded flex items-center justify-center font-mono text-[9px] tracking-wider transition-colors ${
                  hasWorkout
                    ? hasStreak
                      ? "bg-gradient-to-b from-amber-500/25 to-amber-500/[0.08] border border-amber-500/40 text-zinc-400"
                      : "bg-gradient-to-b from-emerald-500/25 to-emerald-500/[0.08] border border-emerald-500/40 text-zinc-400"
                    : today
                      ? "border border-dashed border-cyan-400/40 text-cyan-400"
                      : "bg-[#1a1a1e] border border-zinc-800 text-zinc-700"
                }`}
              >
                {day.dayLabel}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
