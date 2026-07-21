import { query } from "./db";

// All watch source names contain Unicode smart quotes (U+2019) so exact matching
// is fragile. All three variants contain "atch" which is a safe substring match
// that hits the partial index idx_health_raw_watch.
const WATCH_FILTER = "source_name LIKE '%atch%'";

// iOS sends swim distance in miles, the original XML import used yards.
// Sub-10 totals with no unit are assumed to be miles.
const SWIM_YARDS = `
  CASE
    WHEN total_distance_unit = 'mi' THEN total_distance * 1760
    WHEN total_distance < 10 THEN total_distance * 1760
    ELSE total_distance
  END`;

export const STEP_COUNT = "HKQuantityTypeIdentifierStepCount";
export const ACTIVE_ENERGY = "HKQuantityTypeIdentifierActiveEnergyBurned";
export const HRV = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN";
export const RESTING_HR = "HKQuantityTypeIdentifierRestingHeartRate";

export interface DailyTotal {
  date: string;
  total: number;
}

// Daily totals from the daily_metrics materialized view (watch-only, deduped,
// refreshed by cron on the NUC). Only StepCount and ActiveEnergyBurned exist
// in the view.
export async function getDailyTotals(
  recordType: string,
  days: number
): Promise<DailyTotal[]> {
  const sql = `
    SELECT
      TO_CHAR(date, 'YYYY-MM-DD') as date,
      ROUND(total)::int as total
    FROM daily_metrics
    WHERE record_type = $1
      AND date > CURRENT_DATE - $2::int
    ORDER BY date
  `;
  return query<DailyTotal>(sql, [recordType, days]);
}

// Most recent day's total (matches the latest synced day, not calendar today)
export async function getLatestDailyTotal(recordType: string): Promise<number> {
  const sql = `
    SELECT ROUND(total)::int as total
    FROM daily_metrics
    WHERE record_type = $1
    ORDER BY date DESC
    LIMIT 1
  `;
  const rows = await query<{ total: number }>(sql, [recordType]);
  return rows[0]?.total || 0;
}

export interface RestingHeartRate {
  latest: number;
  avg_7d: number;
}

// Resting heart rate (latest + 7-day average)
export async function getRestingHeartRate(): Promise<RestingHeartRate | null> {
  const sql = `
    WITH recent_rhr AS (
      SELECT
        DATE(start_time AT TIME ZONE 'America/New_York') as date,
        AVG(value_numeric) as daily_avg
      FROM health_raw
      WHERE record_type = '${RESTING_HR}'
        AND ${WATCH_FILTER}
        AND start_time > NOW() - INTERVAL '14 days'
      GROUP BY 1
      ORDER BY 1 DESC
    )
    SELECT
      (SELECT ROUND(daily_avg)::int FROM recent_rhr LIMIT 1) as latest,
      (SELECT ROUND(AVG(daily_avg))::int FROM recent_rhr WHERE date > CURRENT_DATE - 7) as avg_7d
  `;
  const rows = await query<RestingHeartRate>(sql);
  return rows[0] || null;
}

export interface RecentWorkout {
  id: string;
  workout_type: string;
  start_time: string;
  duration_seconds: number;
  total_distance: number | null;
  total_energy_burned: number | null;
  avg_hr: number | null;
}

// Recent workouts (excluding walking)
export async function getRecentWorkouts(limit: number = 10): Promise<RecentWorkout[]> {
  const sql = `
    SELECT
      id,
      workout_type,
      start_time::text,
      duration_seconds,
      total_distance,
      total_energy_burned,
      avg_heart_rate as avg_hr
    FROM workouts
    WHERE workout_type != 'HKWorkoutActivityTypeWalking'
    ORDER BY start_time DESC
    LIMIT $1
  `;
  return query<RecentWorkout>(sql, [limit]);
}

export interface SwimmingYearly {
  year: number;
  yards: number;
}

// Swimming totals by year, normalized to yards
export async function getSwimmingByYear(): Promise<SwimmingYearly[]> {
  const sql = `
    SELECT
      EXTRACT(YEAR FROM start_time)::int as year,
      ROUND(COALESCE(SUM(${SWIM_YARDS}), 0)::numeric, 0)::int as yards
    FROM workouts
    WHERE workout_type = 'HKWorkoutActivityTypeSwimming'
      AND EXTRACT(YEAR FROM start_time) >= 2024
    GROUP BY 1
    ORDER BY 1
  `;
  return query<SwimmingYearly>(sql);
}

export interface SwimWorkout {
  date: string;
  yards: number;
  duration_mins: number;
  pace_per_100: number; // seconds per 100 yards
  avg_hr: number | null;
}

export async function getRecentSwims(limit: number = 10): Promise<SwimWorkout[]> {
  const sql = `
    SELECT
      TO_CHAR(DATE(start_time AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD') as date,
      ROUND(${SWIM_YARDS})::int as yards,
      ROUND(duration_seconds / 60)::int as duration_mins,
      ROUND(duration_seconds / (${SWIM_YARDS}) * 100)::int as pace_per_100,
      ROUND(avg_heart_rate)::int as avg_hr
    FROM workouts
    WHERE workout_type = 'HKWorkoutActivityTypeSwimming'
      AND total_distance > 0
    ORDER BY start_time DESC
    LIMIT $1
  `;
  return query<SwimWorkout>(sql, [limit]);
}

// MTD and YTD comparisons for steps and active energy (from daily_metrics)
export interface PeriodComparison {
  metric: string;
  mtd: number;
  mtd_prior: number;
  ytd: number;
  ytd_prior: number;
}

export async function getPeriodComparisons(): Promise<PeriodComparison[]> {
  const sql = `
    WITH bounds AS (
      SELECT
        DATE_TRUNC('month', NOW() AT TIME ZONE 'America/New_York')::date as this_month_start,
        DATE_TRUNC('year', NOW() AT TIME ZONE 'America/New_York')::date as this_year_start,
        EXTRACT(DAY FROM NOW() AT TIME ZONE 'America/New_York')::int as current_dom,
        EXTRACT(DOY FROM NOW() AT TIME ZONE 'America/New_York')::int as current_doy,
        EXTRACT(YEAR FROM NOW())::int as current_year,
        EXTRACT(MONTH FROM NOW())::int as current_month
    )
    SELECT
      CASE record_type
        WHEN '${STEP_COUNT}' THEN 'steps'
        ELSE 'active_energy'
      END as metric,
      COALESCE(SUM(total) FILTER (WHERE date >= b.this_month_start), 0)::bigint as mtd,
      COALESCE(SUM(total) FILTER (
        WHERE EXTRACT(YEAR FROM date) = b.current_year - 1
          AND EXTRACT(MONTH FROM date) = b.current_month
          AND EXTRACT(DAY FROM date) <= b.current_dom
      ), 0)::bigint as mtd_prior,
      COALESCE(SUM(total) FILTER (WHERE date >= b.this_year_start), 0)::bigint as ytd,
      COALESCE(SUM(total) FILTER (
        WHERE EXTRACT(YEAR FROM date) = b.current_year - 1
          AND EXTRACT(DOY FROM date) <= b.current_doy
      ), 0)::bigint as ytd_prior
    FROM daily_metrics
    CROSS JOIN bounds b
    WHERE date >= (b.current_year - 1 || '-01-01')::date
    GROUP BY record_type
  `;
  return query<PeriodComparison>(sql);
}

export interface DataPoint {
  date: string;
  value: number;
}

// Daily average of a record type (HRV, RHR trends)
export async function getDailyAvg(
  recordType: string,
  days: number = 30
): Promise<DataPoint[]> {
  const sql = `
    SELECT
      TO_CHAR(DATE(start_time AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD') as date,
      ROUND(AVG(value_numeric))::int as value
    FROM health_raw
    WHERE record_type = $1
      AND ${WATCH_FILTER}
      AND start_time > NOW() - make_interval(days => $2)
    GROUP BY 1
    ORDER BY 1
  `;
  return query<DataPoint>(sql, [recordType, days]);
}

// Average heart rate during sleep windows, per night
export async function getSleepingHR(days: number = 30): Promise<DataPoint[]> {
  const sql = `
    WITH sleep_windows AS (
      SELECT
        CASE WHEN EXTRACT(HOUR FROM end_time AT TIME ZONE 'America/New_York') < 12
             THEN TO_CHAR(DATE(end_time AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD')
             ELSE TO_CHAR(DATE(end_time AT TIME ZONE 'America/New_York') + 1, 'YYYY-MM-DD')
        END as night,
        start_time,
        end_time
      FROM health_raw
      WHERE record_type = 'HKCategoryTypeIdentifierSleepAnalysis'
        AND value_numeric IN (3, 4, 5)
        AND start_time > NOW() - make_interval(days => $1)
    ),
    sleeping_hr AS (
      SELECT
        sw.night as date,
        hr.value_numeric as hr
      FROM sleep_windows sw
      JOIN health_raw hr
        ON hr.record_type = 'HKQuantityTypeIdentifierHeartRate'
        AND hr.${WATCH_FILTER}
        AND hr.start_time >= sw.start_time
        AND hr.start_time <= sw.end_time
    )
    SELECT
      date,
      ROUND(AVG(hr))::int as value
    FROM sleeping_hr
    GROUP BY date
    ORDER BY date
  `;
  return query<DataPoint>(sql, [days]);
}

// VO2 Max - monthly averages for last 3 months
export interface VO2MaxMonth {
  month: string; // "Jan", "Dec", etc.
  value: number;
}

export interface VO2MaxData {
  months: VO2MaxMonth[];
}

export async function getLatestVO2Max(): Promise<VO2MaxData | null> {
  const sql = `
    WITH monthly AS (
      SELECT
        DATE_TRUNC('month', start_time AT TIME ZONE 'America/New_York') as month_start,
        TO_CHAR(DATE_TRUNC('month', start_time AT TIME ZONE 'America/New_York'), 'Mon') as month,
        ROUND(AVG(value_numeric)::numeric, 1)::float as value
      FROM health_raw
      WHERE record_type = 'HKQuantityTypeIdentifierVO2Max'
        AND ${WATCH_FILTER}
        AND start_time >= DATE_TRUNC('month', NOW() - INTERVAL '2 months')
      GROUP BY 1, 2
      ORDER BY 1 DESC
      LIMIT 3
    )
    SELECT month, value FROM monthly ORDER BY month_start DESC
  `;
  const rows = await query<VO2MaxMonth>(sql);
  return rows.length > 0 ? { months: rows } : null;
}

export interface WorkoutStreakRow {
  day: string;
  workout_type: string;
  duration_seconds: number;
  total_energy_burned: number | null;
  avg_heart_rate: number | null;
  total_distance: number | null;
}

export async function getWorkoutStreak(): Promise<WorkoutStreakRow[]> {
  const sql = `
    SELECT
      TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') as day,
      CASE
        WHEN workout_type = 'HKWorkoutActivityTypeOther'
          AND metadata->>'HKIndoorWorkout' = '1'
          AND metadata ? 'HKElevationAscended'
        THEN 'HKWorkoutActivityTypeStairStepper'
        ELSE workout_type
      END as workout_type,
      duration_seconds,
      total_energy_burned,
      avg_heart_rate,
      total_distance
    FROM workouts
    WHERE start_time AT TIME ZONE 'America/New_York'
          >= DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '6 days'
      AND workout_type != 'HKWorkoutActivityTypeWalking'
    ORDER BY start_time
  `;
  return query<WorkoutStreakRow>(sql);
}
