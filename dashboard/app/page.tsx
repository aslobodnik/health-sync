"use client";

import { useState, useEffect } from "react";
import WorkoutList from "@/components/WorkoutList";
import HeartRateCard from "@/components/HeartRateCard";
import SwimmingCard from "@/components/SwimmingCard";
import WeeklyBarChart from "@/components/WeeklyBarChart";
import YearComparison from "@/components/YearComparison";

interface StepsData {
  daily: { date: string; steps: number }[];
  energy: { date: string; calories: number }[];
  today: number;
}

interface WorkoutsData {
  workouts: {
    id: string;
    workout_type: string;
    start_time: string;
    duration_seconds: number;
    total_distance: number | null;
    avg_hr: number | null;
  }[];
}

interface DailyHR {
  date: string;
  hrv?: number;
  rhr?: number;
}

interface VO2MaxMonth {
  month: string;
  value: number;
}

interface VO2MaxData {
  months: VO2MaxMonth[];
}

interface PeriodData {
  steps: { metric: string; mtd: number; mtd_prior: number; ytd: number; ytd_prior: number } | null;
  energy: { metric: string; mtd: number; mtd_prior: number; ytd: number; ytd_prior: number } | null;
  hrv: DailyHR[];
  rhr: DailyHR[];
  vo2max: VO2MaxData | null;
}

interface SwimWorkout {
  date: string;
  yards: number;
  duration_mins: number;
  pace_per_100: number;
  avg_hr: number | null;
}

interface SwimmingData {
  yearly: { year: number; yards: number }[];
  recentSwims: SwimWorkout[];
}

interface CumulativeData {
  day: number;
  label: string;
  thisYear: number;
  lastYear: number;
}

interface ComparisonData {
  stepsCumulative: CumulativeData[];
  energyCumulative: CumulativeData[];
}

export default function Home() {
  const [stepsData, setStepsData] = useState<StepsData | null>(null);
  const [workoutsData, setWorkoutsData] = useState<WorkoutsData | null>(null);
  const [periodData, setPeriodData] = useState<PeriodData | null>(null);
  const [swimmingData, setSwimmingData] = useState<SwimmingData | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [steps, workouts, periods, swimming, comparison] = await Promise.all([
          fetch("/api/health/steps").then((r) => r.json()),
          fetch("/api/health/workouts").then((r) => r.json()),
          fetch("/api/health/periods").then((r) => r.json()),
          fetch("/api/health/swimming").then((r) => r.json()),
          fetch("/api/health/comparison").then((r) => r.json()),
        ]);

        setStepsData(steps);
        setWorkoutsData(workouts);
        setPeriodData(periods);
        setSwimmingData(swimming);
        setComparisonData(comparison);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Convert HR data for trend components
  const hrvTrendData = periodData?.hrv?.map((d) => ({
    date: d.date,
    value: d.hrv ?? 0,
  })) ?? [];

  const rhrTrendData = periodData?.rhr?.map((d) => ({
    date: d.date,
    value: d.rhr ?? 0,
  })) ?? [];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-zinc-600 text-sm uppercase tracking-widest">loading...</div>
      </div>
    );
  }

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
        {/* Weekly bar charts */}
        <div className="flex flex-col gap-4 mb-8 max-w-md mx-auto">
          <div className="reveal reveal-delay-1">
            <WeeklyBarChart
              title="steps"
              data={stepsData?.daily.map((d) => ({ date: d.date, value: d.steps })) ?? []}
              unit="steps"
              goal={13000}
            />
          </div>
          <div className="reveal reveal-delay-2">
            <WeeklyBarChart
              title="active calories"
              data={stepsData?.energy.map((d) => ({ date: d.date, value: d.calories })) ?? []}
              unit="kcal"
              goal={1000}
            />
          </div>
        </div>

        {/* Year comparison */}
        {comparisonData && (
          <div className="mb-8">
            <YearComparison
              stepsCumulative={comparisonData.stepsCumulative}
              energyCumulative={comparisonData.energyCumulative}
            />
          </div>
        )}

        {/* Heart rate and swimming */}
        {(hrvTrendData.length > 0 || rhrTrendData.length > 0 || swimmingData) && (
          <div className="mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-zinc-700" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono">
                vitals & swimming
              </span>
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-zinc-700" />
            </div>
            <div className="flex justify-center gap-3 sm:gap-4 flex-wrap">
              {(rhrTrendData.length > 0 || hrvTrendData.length > 0) && (
                <HeartRateCard rhr={rhrTrendData} hrv={hrvTrendData} vo2max={periodData?.vo2max} />
              )}
              {swimmingData && (
                <SwimmingCard
                  years={swimmingData.yearly}
                  recentSwims={swimmingData.recentSwims}
                />
              )}
            </div>
          </div>
        )}

        {/* Recent workouts */}
        {workoutsData?.workouts && workoutsData.workouts.length > 0 && (
          <WorkoutList workouts={workoutsData.workouts} />
        )}
      </main>
    </div>
  );
}
