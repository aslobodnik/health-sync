import { query } from "./db";

export interface DailySteps {
  date: string;
  steps: number;
}

export interface DailyEnergy {
  date: string;
  calories: number;
}

export interface DailySleep {
  date: string;
  hours: number;
}

export interface RestingHeartRate {
  latest: number;
  avg_7d: number;
}

export interface WeeklyZone2 {
  week: string;
  minutes: number;
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

// Daily steps for last N days (watch only, deduped)
export async function getDailySteps(days: number = 365): Promise<DailySteps[]> {
  const sql = `
    WITH unique_records AS (
      SELECT DISTINCT ON (start_time, end_time, value_numeric)
        start_time, value_numeric
      FROM health_raw
      WHERE record_type = 'HKQuantityTypeIdentifierStepCount'
        AND source_name ILIKE '%watch%'
        AND start_time > NOW() - INTERVAL '${days} days'
    )
    SELECT
      TO_CHAR(DATE(start_time AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD') as date,
      SUM(value_numeric)::int as steps
    FROM unique_records
    GROUP BY 1
    ORDER BY 1
  `;
  return query<DailySteps>(sql);
}

// Daily active energy for last N days (watch only, deduped)
export async function getDailyEnergy(days: number = 365): Promise<DailyEnergy[]> {
  const sql = `
    WITH unique_records AS (
      SELECT DISTINCT ON (start_time, end_time, value_numeric)
        start_time, value_numeric
      FROM health_raw
      WHERE record_type = 'HKQuantityTypeIdentifierActiveEnergyBurned'
        AND source_name ILIKE '%watch%'
        AND start_time > NOW() - INTERVAL '${days} days'
    )
    SELECT
      TO_CHAR(DATE(start_time AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD') as date,
      ROUND(SUM(value_numeric))::int as calories
    FROM unique_records
    GROUP BY 1
    ORDER BY 1
  `;
  return query<DailyEnergy>(sql);
}

// Daily sleep duration for last N days (watch only, actual sleep not just "in bed")
// Only counts sleep between 8:30pm and 11am (nighttime sleep, no naps)
// Attributes sleep to the previous day (wake date - 1) so "Jan 15 7am wake" = "Jan 14 sleep"
// Uses DISTINCT to avoid duplicate records from Apple Health export
export async function getDailySleep(days: number = 365): Promise<DailySleep[]> {
  const sql = `
    WITH unique_sleep AS (
      SELECT DISTINCT ON (start_time, end_time, value_text)
        start_time, end_time,
        (DATE(end_time AT TIME ZONE 'America/New_York') - INTERVAL '1 day')::date as sleep_night
      FROM health_raw
      WHERE record_type = 'HKCategoryTypeIdentifierSleepAnalysis'
        AND source_name ILIKE '%watch%'
        AND value_text IN (
          'HKCategoryValueSleepAnalysisAsleep',
          'HKCategoryValueSleepAnalysisAsleepCore',
          'HKCategoryValueSleepAnalysisAsleepDeep',
          'HKCategoryValueSleepAnalysisAsleepREM'
        )
        AND start_time > NOW() - INTERVAL '${days} days'
        -- Only nighttime sleep: 8:30pm to 11am
        AND (
          (start_time AT TIME ZONE 'America/New_York')::time >= '20:30:00'
          OR (start_time AT TIME ZONE 'America/New_York')::time < '11:00:00'
        )
    )
    SELECT
      TO_CHAR(sleep_night, 'YYYY-MM-DD') as date,
      ROUND(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600)::numeric, 2)::float as hours
    FROM unique_sleep
    GROUP BY 1
    ORDER BY 1
  `;
  return query<DailySleep>(sql);
}

// Resting heart rate (latest + 7-day average)
export async function getRestingHeartRate(): Promise<RestingHeartRate | null> {
  const sql = `
    WITH recent_rhr AS (
      SELECT
        DATE(start_time AT TIME ZONE 'America/New_York') as date,
        AVG(value_numeric) as daily_avg
      FROM health_raw
      WHERE record_type = 'HKQuantityTypeIdentifierRestingHeartRate'
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

// Weekly Zone 2 training minutes (HR between 107-125 for age 42)
// Uses workout durations where avg HR is in zone 2 range
export async function getWeeklyZone2(weeks: number = 52): Promise<WeeklyZone2[]> {
  const sql = `
    SELECT
      TO_CHAR(DATE_TRUNC('week', start_time AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD') as week,
      COALESCE(ROUND(SUM(duration_seconds)::numeric / 60, 0)::int, 0) as minutes
    FROM workouts
    WHERE avg_heart_rate BETWEEN 107 AND 125
      AND start_time > NOW() - INTERVAL '${weeks} weeks'
    GROUP BY 1
    ORDER BY 1
  `;
  return query<WeeklyZone2>(sql);
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
    LIMIT ${limit}
  `;
  return query<RecentWorkout>(sql);
}

// Get most recent day's step count (watch only, uses latest data date)
export async function getTodaySteps(): Promise<number> {
  const sql = `
    WITH latest_date AS (
      SELECT DATE(MAX(start_time) AT TIME ZONE 'America/New_York') as d
      FROM health_raw
      WHERE record_type = 'HKQuantityTypeIdentifierStepCount'
        AND source_name ILIKE '%watch%'
    )
    SELECT COALESCE(SUM(value_numeric), 0)::int as steps
    FROM health_raw, latest_date
    WHERE record_type = 'HKQuantityTypeIdentifierStepCount'
      AND source_name ILIKE '%watch%'
      AND DATE(start_time AT TIME ZONE 'America/New_York') = latest_date.d
  `;
  const rows = await query<{ steps: number }>(sql);
  return rows[0]?.steps || 0;
}

// Get most recent night's sleep (watch only, actual sleep not "in bed")
// Only nighttime sleep (8:30pm-11am), attributed to wake date - 1
// Uses DISTINCT to avoid duplicate records
export async function getLastNightSleep(): Promise<number> {
  const sql = `
    WITH unique_sleep AS (
      SELECT DISTINCT ON (start_time, end_time, value_text)
        start_time, end_time,
        (DATE(end_time AT TIME ZONE 'America/New_York') - INTERVAL '1 day')::date as sleep_night
      FROM health_raw
      WHERE record_type = 'HKCategoryTypeIdentifierSleepAnalysis'
        AND source_name ILIKE '%watch%'
        AND value_text IN (
          'HKCategoryValueSleepAnalysisAsleep',
          'HKCategoryValueSleepAnalysisAsleepCore',
          'HKCategoryValueSleepAnalysisAsleepDeep',
          'HKCategoryValueSleepAnalysisAsleepREM'
        )
        AND start_time > NOW() - INTERVAL '7 days'
        AND (
          (start_time AT TIME ZONE 'America/New_York')::time >= '20:30:00'
          OR (start_time AT TIME ZONE 'America/New_York')::time < '11:00:00'
        )
    ),
    latest_night AS (
      SELECT MAX(sleep_night) as d FROM unique_sleep
    )
    SELECT
      ROUND(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600)::numeric, 2)::float as hours
    FROM unique_sleep, latest_night
    WHERE sleep_night = latest_night.d
  `;
  const rows = await query<{ hours: number }>(sql);
  return rows[0]?.hours || 0;
}

export interface SportSummary {
  workout_type: string;
  sessions_this_week: number;
  sessions_last_week: number;
  distance_this_week: number;
  distance_last_week: number;
  distance_unit: string;
  total_distance_ytd: number;
}

// Sports summary for running, swimming, cycling: this week vs last week + YTD
export async function getSportsSummary(): Promise<SportSummary[]> {
  const sql = `
    WITH week_bounds AS (
      SELECT
        DATE_TRUNC('week', NOW() AT TIME ZONE 'America/New_York') as this_week_start,
        DATE_TRUNC('week', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '1 week' as last_week_start,
        DATE_TRUNC('year', NOW() AT TIME ZONE 'America/New_York') as year_start
    ),
    sport_types AS (
      SELECT unnest(ARRAY[
        'HKWorkoutActivityTypeRunning',
        'HKWorkoutActivityTypeSwimming',
        'HKWorkoutActivityTypeCycling'
      ]) as workout_type
    ),
    stats AS (
      SELECT
        w.workout_type,
        COUNT(*) FILTER (WHERE w.start_time >= wb.this_week_start) as sessions_this_week,
        COUNT(*) FILTER (WHERE w.start_time >= wb.last_week_start AND w.start_time < wb.this_week_start) as sessions_last_week,
        COALESCE(SUM(w.total_distance) FILTER (WHERE w.start_time >= wb.this_week_start), 0) as distance_this_week,
        COALESCE(SUM(w.total_distance) FILTER (WHERE w.start_time >= wb.last_week_start AND w.start_time < wb.this_week_start), 0) as distance_last_week,
        COALESCE(SUM(w.total_distance) FILTER (WHERE w.start_time >= wb.year_start), 0) as total_distance_ytd
      FROM workouts w
      CROSS JOIN week_bounds wb
      WHERE w.workout_type IN (
        'HKWorkoutActivityTypeRunning',
        'HKWorkoutActivityTypeSwimming',
        'HKWorkoutActivityTypeCycling'
      )
      GROUP BY w.workout_type
    )
    SELECT
      st.workout_type,
      COALESCE(s.sessions_this_week, 0)::int as sessions_this_week,
      COALESCE(s.sessions_last_week, 0)::int as sessions_last_week,
      ROUND(COALESCE(s.distance_this_week, 0)::numeric, 2)::float as distance_this_week,
      ROUND(COALESCE(s.distance_last_week, 0)::numeric, 2)::float as distance_last_week,
      CASE
        WHEN st.workout_type = 'HKWorkoutActivityTypeSwimming' THEN 'yd'
        ELSE 'mi'
      END as distance_unit,
      ROUND(COALESCE(s.total_distance_ytd, 0)::numeric, 2)::float as total_distance_ytd
    FROM sport_types st
    LEFT JOIN stats s ON st.workout_type = s.workout_type
    ORDER BY st.workout_type
  `;
  return query<SportSummary>(sql);
}

export interface MetricComparison {
  metric: string;
  this_week: number;
  last_week: number;
  this_month: number;
  last_month: number;
}

// Compare steps and sleep: this week vs last week, this month vs last month
// Uses same day-of-week/month for fair comparison (e.g., Jan 1-16 vs Dec 1-16)
export async function getComparisons(): Promise<MetricComparison[]> {
  const sql = `
    WITH time_bounds AS (
      SELECT
        DATE_TRUNC('week', NOW() AT TIME ZONE 'America/New_York') as this_week_start,
        DATE_TRUNC('week', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '1 week' as last_week_start,
        DATE_TRUNC('month', NOW() AT TIME ZONE 'America/New_York') as this_month_start,
        DATE_TRUNC('month', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '1 month' as last_month_start,
        -- Current position in week/month for fair comparison
        EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/New_York')::int as current_dow,
        EXTRACT(DAY FROM NOW() AT TIME ZONE 'America/New_York')::int as current_dom
    ),
    steps AS (
      SELECT
        'steps' as metric,
        COALESCE(SUM(value_numeric) FILTER (
          WHERE start_time >= tb.this_week_start
        ), 0)::int as this_week,
        COALESCE(SUM(value_numeric) FILTER (
          WHERE start_time >= tb.last_week_start
            AND start_time < tb.last_week_start + (tb.current_dow || ' days')::interval + INTERVAL '1 day'
        ), 0)::int as last_week,
        COALESCE(SUM(value_numeric) FILTER (
          WHERE start_time >= tb.this_month_start
        ), 0)::int as this_month,
        COALESCE(SUM(value_numeric) FILTER (
          WHERE start_time >= tb.last_month_start
            AND EXTRACT(DAY FROM start_time AT TIME ZONE 'America/New_York') <= tb.current_dom
        ), 0)::int as last_month
      FROM health_raw
      CROSS JOIN time_bounds tb
      WHERE record_type = 'HKQuantityTypeIdentifierStepCount'
        AND source_name ILIKE '%watch%'
        AND start_time >= tb.last_month_start
    ),
    sleep AS (
      SELECT
        'sleep_hours' as metric,
        ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) FILTER (
          WHERE start_time >= tb.this_week_start
        ), 0)::numeric, 1)::float as this_week,
        ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) FILTER (
          WHERE start_time >= tb.last_week_start
            AND start_time < tb.last_week_start + (tb.current_dow || ' days')::interval + INTERVAL '1 day'
        ), 0)::numeric, 1)::float as last_week,
        ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) FILTER (
          WHERE start_time >= tb.this_month_start
        ), 0)::numeric, 1)::float as this_month,
        ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) FILTER (
          WHERE start_time >= tb.last_month_start
            AND EXTRACT(DAY FROM start_time AT TIME ZONE 'America/New_York') <= tb.current_dom
        ), 0)::numeric, 1)::float as last_month
      FROM health_raw
      CROSS JOIN time_bounds tb
      WHERE record_type = 'HKCategoryTypeIdentifierSleepAnalysis'
        AND source_name ILIKE '%watch%'
        AND value_text IN (
          'HKCategoryValueSleepAnalysisAsleep',
          'HKCategoryValueSleepAnalysisAsleepCore',
          'HKCategoryValueSleepAnalysisAsleepDeep',
          'HKCategoryValueSleepAnalysisAsleepREM'
        )
        AND start_time >= tb.last_month_start
    )
    SELECT * FROM steps
    UNION ALL
    SELECT * FROM sleep
  `;
  return query<MetricComparison>(sql);
}

export interface SwimmingYearly {
  year: number;
  yards: number;
}

// Swimming totals by year (normalize to yards - some records are in miles)
export async function getSwimmingByYear(): Promise<SwimmingYearly[]> {
  const sql = `
    SELECT
      EXTRACT(YEAR FROM start_time)::int as year,
      ROUND(COALESCE(SUM(
        CASE
          WHEN total_distance_unit = 'mi' THEN total_distance * 1760
          WHEN total_distance < 10 THEN total_distance * 1760  -- likely miles
          ELSE total_distance
        END
      ), 0)::numeric, 0)::int as yards
    FROM workouts
    WHERE workout_type = 'HKWorkoutActivityTypeSwimming'
      AND EXTRACT(YEAR FROM start_time) >= 2024
    GROUP BY 1
    ORDER BY 1
  `;
  return query<SwimmingYearly>(sql);
}

// MTD and YTD comparisons for steps and active energy
export interface PeriodComparison {
  metric: string;
  mtd: number;
  mtd_prior: number;
  ytd: number;
  ytd_prior: number;
}

export async function getPeriodComparisons(): Promise<PeriodComparison[]> {
  // Uses daily_metrics materialized view for fast aggregation
  const sql = `
    WITH bounds AS (
      SELECT
        DATE_TRUNC('month', NOW() AT TIME ZONE 'America/New_York')::date as this_month_start,
        DATE_TRUNC('year', NOW() AT TIME ZONE 'America/New_York')::date as this_year_start,
        (NOW() AT TIME ZONE 'America/New_York')::date as today,
        EXTRACT(DAY FROM NOW() AT TIME ZONE 'America/New_York')::int as current_dom,
        EXTRACT(DOY FROM NOW() AT TIME ZONE 'America/New_York')::int as current_doy,
        EXTRACT(YEAR FROM NOW())::int as current_year,
        EXTRACT(MONTH FROM NOW())::int as current_month
    )
    SELECT
      CASE record_type
        WHEN 'HKQuantityTypeIdentifierStepCount' THEN 'steps'
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

// HRV trend (daily averages for last 30 days)
export interface DailyHRV {
  date: string;
  hrv: number;
}

export async function getDailyHRV(days: number = 30): Promise<DailyHRV[]> {
  const sql = `
    SELECT
      TO_CHAR(DATE(start_time AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD') as date,
      ROUND(AVG(value_numeric))::int as hrv
    FROM health_raw
    WHERE record_type = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN'
      AND start_time > NOW() - INTERVAL '${days} days'
    GROUP BY 1
    ORDER BY 1
  `;
  return query<DailyHRV>(sql);
}

// RHR trend (daily averages for last 30 days)
export interface DailyRHR {
  date: string;
  rhr: number;
}

export async function getDailyRHR(days: number = 30): Promise<DailyRHR[]> {
  const sql = `
    SELECT
      TO_CHAR(DATE(start_time AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD') as date,
      ROUND(AVG(value_numeric))::int as rhr
    FROM health_raw
    WHERE record_type = 'HKQuantityTypeIdentifierRestingHeartRate'
      AND start_time > NOW() - INTERVAL '${days} days'
    GROUP BY 1
    ORDER BY 1
  `;
  return query<DailyRHR>(sql);
}

// Swimming workout details (for display)
export interface SwimWorkout {
  date: string;
  yards: number;
  duration_mins: number;
  pace_per_100: number;  // seconds per 100 yards
  avg_hr: number | null;
}

export async function getRecentSwims(limit: number = 10): Promise<SwimWorkout[]> {
  const sql = `
    SELECT
      TO_CHAR(DATE(start_time AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD') as date,
      ROUND(CASE
        WHEN total_distance_unit = 'mi' THEN total_distance * 1760
        WHEN total_distance < 10 THEN total_distance * 1760
        ELSE total_distance
      END)::int as yards,
      ROUND(duration_seconds / 60)::int as duration_mins,
      ROUND(duration_seconds / (
        CASE
          WHEN total_distance_unit = 'mi' THEN total_distance * 1760
          WHEN total_distance < 10 THEN total_distance * 1760
          ELSE total_distance
        END
      ) * 100)::int as pace_per_100,
      ROUND(avg_heart_rate)::int as avg_hr
    FROM workouts
    WHERE workout_type = 'HKWorkoutActivityTypeSwimming'
      AND total_distance > 0
    ORDER BY start_time DESC
    LIMIT ${limit}
  `;
  return query<SwimWorkout>(sql);
}

// Daily cumulative steps comparison: this year vs last year
export interface DailyCumulative {
  day: number; // day of year (1-366)
  label: string; // "Jan 1", "Jan 2", etc
  thisYear: number;
  lastYear: number;
}

export async function getYearOverYearSteps(): Promise<DailyCumulative[]> {
  const sql = `
    WITH bounds AS (
      SELECT
        EXTRACT(YEAR FROM NOW())::int as current_year,
        EXTRACT(DOY FROM NOW() AT TIME ZONE 'America/New_York')::int as current_doy
    ),
    daily AS (
      SELECT
        EXTRACT(YEAR FROM date)::int as year,
        EXTRACT(DOY FROM date)::int as doy,
        TO_CHAR(date, 'Mon DD') as label,
        total
      FROM daily_metrics
      CROSS JOIN bounds b
      WHERE record_type = 'HKQuantityTypeIdentifierStepCount'
        AND (
          (EXTRACT(YEAR FROM date) = b.current_year AND EXTRACT(DOY FROM date) <= b.current_doy)
          OR (EXTRACT(YEAR FROM date) = b.current_year - 1 AND EXTRACT(DOY FROM date) <= b.current_doy)
        )
    ),
    cumulative AS (
      SELECT
        year,
        doy,
        label,
        SUM(total) OVER (PARTITION BY year ORDER BY doy) as cumulative_total
      FROM daily
    )
    SELECT
      c1.doy as day,
      c1.label,
      COALESCE(c1.cumulative_total, 0)::bigint as "thisYear",
      COALESCE(c2.cumulative_total, 0)::bigint as "lastYear"
    FROM cumulative c1
    LEFT JOIN cumulative c2 ON c1.doy = c2.doy AND c2.year = (SELECT current_year - 1 FROM bounds)
    WHERE c1.year = (SELECT current_year FROM bounds)
    ORDER BY c1.doy
  `;
  return query<DailyCumulative>(sql);
}

// VO2 Max - monthly averages for last 3 months
export interface VO2MaxMonth {
  month: string;  // "Jan", "Dec", etc.
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

// Daily cumulative active energy comparison: this year vs last year
export async function getYearOverYearEnergy(): Promise<DailyCumulative[]> {
  const sql = `
    WITH bounds AS (
      SELECT
        EXTRACT(YEAR FROM NOW())::int as current_year,
        EXTRACT(DOY FROM NOW() AT TIME ZONE 'America/New_York')::int as current_doy
    ),
    daily AS (
      SELECT
        EXTRACT(YEAR FROM date)::int as year,
        EXTRACT(DOY FROM date)::int as doy,
        TO_CHAR(date, 'Mon DD') as label,
        total
      FROM daily_metrics
      CROSS JOIN bounds b
      WHERE record_type = 'HKQuantityTypeIdentifierActiveEnergyBurned'
        AND (
          (EXTRACT(YEAR FROM date) = b.current_year AND EXTRACT(DOY FROM date) <= b.current_doy)
          OR (EXTRACT(YEAR FROM date) = b.current_year - 1 AND EXTRACT(DOY FROM date) <= b.current_doy)
        )
    ),
    cumulative AS (
      SELECT
        year,
        doy,
        label,
        SUM(total) OVER (PARTITION BY year ORDER BY doy) as cumulative_total
      FROM daily
    )
    SELECT
      c1.doy as day,
      c1.label,
      COALESCE(c1.cumulative_total, 0)::bigint as "thisYear",
      COALESCE(c2.cumulative_total, 0)::bigint as "lastYear"
    FROM cumulative c1
    LEFT JOIN cumulative c2 ON c1.doy = c2.doy AND c2.year = (SELECT current_year - 1 FROM bounds)
    WHERE c1.year = (SELECT current_year FROM bounds)
    ORDER BY c1.doy
  `;
  return query<DailyCumulative>(sql);
}
