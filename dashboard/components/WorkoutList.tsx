interface Workout {
  id: string;
  workout_type: string;
  start_time: string;
  duration_seconds: number;
  total_distance: number | null;
  avg_hr: number | null;
}

interface WorkoutListProps {
  workouts: Workout[];
}

function formatWorkoutType(type: string): string {
  // Remove HKWorkoutActivityType prefix
  const name = type.replace("HKWorkoutActivityType", "");
  // Add space before capitals and trim
  return name.replace(/([A-Z])/g, " $1").trim();
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}h ${remainingMins}m`;
  }
  return `${mins} min`;
}

function formatDistance(miles: number | null): string | null {
  if (!miles || miles < 0.1) return null;
  return `${miles.toFixed(1)} mi`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function WorkoutList({ workouts }: WorkoutListProps) {
  if (workouts.length === 0) {
    return (
      <div className="text-center text-zinc-600 text-sm py-8">
        No recent workouts
      </div>
    );
  }

  return (
    <div className="reveal">
      {/* Section header */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <div className="h-px w-12 bg-gradient-to-r from-transparent to-zinc-700" />
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono">
          recent workouts
        </span>
        <div className="h-px w-12 bg-gradient-to-l from-transparent to-zinc-700" />
      </div>

      <div className="space-y-2">
        {workouts.map((workout) => (
          <div
            key={workout.id}
            className="bg-zinc-900/30 border border-zinc-800/50 rounded-lg px-4 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-zinc-300 truncate">
                {formatWorkoutType(workout.workout_type)}
              </div>
              <div className="text-xs text-zinc-600 shrink-0">{formatDate(workout.start_time)}</div>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500 font-mono">
              <span>{formatDuration(workout.duration_seconds)}</span>
              {formatDistance(workout.total_distance) && (
                <>
                  <span className="text-zinc-700">·</span>
                  <span>{formatDistance(workout.total_distance)}</span>
                </>
              )}
              {workout.avg_hr && (
                <>
                  <span className="text-zinc-700">·</span>
                  <span>{Math.round(workout.avg_hr)} bpm</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
