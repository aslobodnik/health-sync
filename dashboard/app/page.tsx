import WorkoutList from "@/components/WorkoutList";
import HeartRateCard from "@/components/HeartRateCard";
import SwimmingCard from "@/components/SwimmingCard";
import WeeklyBarChart from "@/components/WeeklyBarChart";
import YearComparisonA from "@/components/YearComparisonA";
import WorkoutStreakCard from "@/components/WorkoutStreakCard";
import {
  ACTIVE_ENERGY,
  HRV,
  RESTING_HR,
  STEP_COUNT,
  getDailyAvg,
  getDailyTotals,
  getLatestVO2Max,
  getPeriodComparisons,
  getRecentSwims,
  getRecentWorkouts,
  getSleepingHR,
  getSwimmingByYear,
} from "@/lib/queries";
import { getWorkoutStreakData } from "@/lib/workoutStreak";

// Server-rendered per request: 11 parallel queries, all view-backed or
// index-only (~100ms total). Never prerendered at build time - the build
// machine cannot always reach the NUC.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [
    dailySteps,
    dailyEnergy,
    workouts,
    periods,
    hrv,
    rhr,
    sleepHr,
    vo2max,
    swimYears,
    recentSwims,
    workoutStreak,
  ] = await Promise.all([
    getDailyTotals(STEP_COUNT, 8),
    getDailyTotals(ACTIVE_ENERGY, 8),
    getRecentWorkouts(10),
    getPeriodComparisons(),
    getDailyAvg(HRV, 30),
    getDailyAvg(RESTING_HR, 30),
    getSleepingHR(30),
    getLatestVO2Max(),
    getSwimmingByYear(),
    getRecentSwims(5),
    getWorkoutStreakData(),
  ]);

  const stepsPeriod = periods.find((p) => p.metric === "steps") ?? null;
  const energyPeriod = periods.find((p) => p.metric === "active_energy") ?? null;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col relative overflow-hidden">
      {/* Atmospheric effects */}
      <div className="vignette" />
      <div className="scanlines opacity-30" />

      {/* Header */}
      <header className="relative z-10 pt-10 sm:pt-14 pb-8 text-center">
        <div className="inline-flex flex-col items-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl uppercase tracking-[0.3em] font-bold header-glow">
            slobo health
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 tracking-[0.25em] mt-3 font-mono">
            keeping the meat suit running
          </p>
          {/* Animated ECG line */}
          <div className="mt-6 w-64 sm:w-80 h-12 relative overflow-hidden">
            <svg className="ecg-line absolute inset-0 w-full h-full" viewBox="0 0 400 50" preserveAspectRatio="none">
              <path
                className="ecg-path"
                d="M0,25 L80,25 L100,25 L110,20 L120,25 L140,25 L155,25 L160,35 L170,5 L180,40 L190,25 L210,25 L240,20 L260,25 L320,25 L400,25"
                fill="none"
                stroke="url(#ecgGradient)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="ecgGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(16, 185, 129, 0)" />
                  <stop offset="30%" stopColor="rgba(16, 185, 129, 0.8)" />
                  <stop offset="50%" stopColor="rgba(34, 211, 238, 1)" />
                  <stop offset="70%" stopColor="rgba(16, 185, 129, 0.8)" />
                  <stop offset="100%" stopColor="rgba(16, 185, 129, 0)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="ecg-glow absolute inset-0" />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 px-4 pb-8 max-w-5xl mx-auto w-full">
        {/* Workout streak */}
        <div className="mb-8 max-w-md mx-auto">
          <div className="reveal reveal-delay-1">
            <WorkoutStreakCard
              days={workoutStreak.days}
              activeDayCount={workoutStreak.activeDayCount}
              dateRange={workoutStreak.dateRange}
            />
          </div>
        </div>

        {/* Weekly bar charts */}
        <div className="flex flex-col gap-4 mb-8 max-w-md mx-auto">
          <div className="reveal reveal-delay-2">
            <WeeklyBarChart
              title="steps"
              data={dailySteps.map((d) => ({ date: d.date, value: d.total }))}
              unit="steps"
              goal={13000}
            />
          </div>
          <div className="reveal reveal-delay-3">
            <WeeklyBarChart
              title="active calories"
              data={dailyEnergy.map((d) => ({ date: d.date, value: d.total }))}
              unit="kcal"
              goal={1000}
            />
          </div>
        </div>

        {/* Year comparison */}
        <div className="mb-8">
          <YearComparisonA steps={stepsPeriod} energy={energyPeriod} />
        </div>

        {/* Heart rate and swimming */}
        {(hrv.length > 0 || rhr.length > 0 || swimYears.length > 0) && (
          <div className="mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-zinc-700" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono">
                vitals & swimming
              </span>
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-zinc-700" />
            </div>
            <div className="flex justify-center gap-3 sm:gap-4 flex-wrap">
              {(rhr.length > 0 || hrv.length > 0 || sleepHr.length > 0) && (
                <HeartRateCard rhr={rhr} hrv={hrv} sleepHr={sleepHr} vo2max={vo2max} />
              )}
              <SwimmingCard years={swimYears} recentSwims={recentSwims} />
            </div>
          </div>
        )}

        {/* Recent workouts */}
        {workouts.length > 0 && <WorkoutList workouts={workouts} />}
      </main>
    </div>
  );
}
