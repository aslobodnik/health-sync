import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import pool from "@/lib/db";
import { requireAuth } from "@/lib/auth";

interface HealthRecordPayload {
  recordType: string;
  sourceName: string;
  sourceBundle?: string;
  value?: number;
  valueText?: string;
  unit?: string;
  startTime: string;
  endTime: string;
  metadata?: Record<string, string>;
  sampleUUID?: string;
}

interface WorkoutPayload {
  workoutType: string;
  sourceName: string;
  sourceBundle?: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  totalDistance?: number;
  totalEnergyBurned?: number;
  statistics?: Record<string, number>;
  metadata?: Record<string, string>;
  sampleUUID?: string;
}

interface SyncBatch {
  dataType: string;
  records?: HealthRecordPayload[];
  workouts?: WorkoutPayload[];
  deletedUUIDs: string[];
  deviceId: string;
  timestamp: string;
}

function generateRecordHash(record: HealthRecordPayload): string {
  const key = `${record.recordType}|${record.sourceName}|${record.startTime}|${record.endTime}|${record.value ?? record.valueText}`;
  return createHash("sha256").update(key).digest("hex");
}

function generateWorkoutHash(workout: WorkoutPayload): string {
  const key = `${workout.workoutType}|${workout.sourceName}|${workout.startTime}|${workout.endTime}|${workout.durationSeconds}`;
  return createHash("sha256").update(key).digest("hex");
}

// Distinct HealthKit samples can share a hash (same type/source/times/value,
// different UUIDs). A single multi-row upsert cannot affect the same row
// twice ("ON CONFLICT DO UPDATE command cannot affect row a second time"),
// so keep one row per hash - preferring one that carries a sampleUUID.
function dedupeByHash<T extends { sampleUUID?: string }>(
  items: T[],
  hashFn: (item: T) => string
): { item: T; hash: string }[] {
  const byHash = new Map<string, { item: T; hash: string }>();
  for (const item of items) {
    const hash = hashFn(item);
    const existing = byHash.get(hash);
    if (!existing || (item.sampleUUID && !existing.item.sampleUUID)) {
      byHash.set(hash, { item, hash });
    }
  }
  return [...byHash.values()];
}

// Single set-based upsert per batch (one round trip instead of one per row).
// The DO UPDATE only fires when it would backfill a sample UUID, so healing
// re-uploads of identical rows are no-ops instead of dead-tuple churn.
const INSERT_RECORDS = `
  INSERT INTO health_raw (
    record_type, source_name, source_bundle_id, unit,
    value_numeric, value_text, start_time, end_time,
    metadata, record_hash, sample_uuid
  )
  SELECT * FROM UNNEST(
    $1::text[], $2::text[], $3::text[], $4::text[],
    $5::float8[], $6::text[], $7::timestamptz[], $8::timestamptz[],
    $9::jsonb[], $10::text[], $11::text[]
  )
  ON CONFLICT (record_hash) DO UPDATE SET
    sample_uuid = EXCLUDED.sample_uuid,
    value_numeric = EXCLUDED.value_numeric,
    value_text = EXCLUDED.value_text,
    metadata = EXCLUDED.metadata
  WHERE EXCLUDED.sample_uuid IS NOT NULL
    AND health_raw.sample_uuid IS DISTINCT FROM EXCLUDED.sample_uuid
`;

const INSERT_WORKOUTS = `
  INSERT INTO workouts (
    workout_type, source_name, source_bundle_id,
    start_time, end_time, duration_seconds,
    total_distance, total_distance_unit,
    total_energy_burned, total_energy_unit,
    avg_heart_rate, min_heart_rate, max_heart_rate,
    metadata, workout_hash, sample_uuid
  )
  SELECT * FROM UNNEST(
    $1::text[], $2::text[], $3::text[],
    $4::timestamptz[], $5::timestamptz[], $6::float8[],
    $7::float8[], $8::text[],
    $9::float8[], $10::text[],
    $11::float8[], $12::float8[], $13::float8[],
    $14::jsonb[], $15::text[], $16::text[]
  )
  ON CONFLICT (workout_hash) DO UPDATE SET
    sample_uuid = EXCLUDED.sample_uuid,
    duration_seconds = EXCLUDED.duration_seconds,
    total_distance = EXCLUDED.total_distance,
    total_energy_burned = EXCLUDED.total_energy_burned,
    avg_heart_rate = EXCLUDED.avg_heart_rate,
    min_heart_rate = EXCLUDED.min_heart_rate,
    max_heart_rate = EXCLUDED.max_heart_rate,
    metadata = EXCLUDED.metadata
  WHERE EXCLUDED.sample_uuid IS NOT NULL
    AND workouts.sample_uuid IS DISTINCT FROM EXCLUDED.sample_uuid
`;

export async function POST(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const batch: SyncBatch = await request.json();
    let insertedRecords = 0;
    let insertedWorkouts = 0;
    let skippedDuplicates = 0;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      if (batch.records && batch.records.length > 0) {
        const r = dedupeByHash(batch.records, generateRecordHash);
        const result = await client.query(INSERT_RECORDS, [
          r.map(({ item }) => item.recordType),
          r.map(({ item }) => item.sourceName),
          r.map(({ item }) => item.sourceBundle ?? null),
          r.map(({ item }) => item.unit ?? null),
          r.map(({ item }) => item.value ?? null),
          r.map(({ item }) => item.valueText ?? null),
          r.map(({ item }) => item.startTime),
          r.map(({ item }) => item.endTime),
          r.map(({ item }) => (item.metadata ? JSON.stringify(item.metadata) : null)),
          r.map(({ hash }) => hash),
          r.map(({ item }) => item.sampleUUID ?? null),
        ]);
        insertedRecords = result.rowCount ?? 0;
        skippedDuplicates += batch.records.length - insertedRecords;
      }

      if (batch.workouts && batch.workouts.length > 0) {
        const w = dedupeByHash(batch.workouts, generateWorkoutHash);
        const result = await client.query(INSERT_WORKOUTS, [
          w.map(({ item }) => item.workoutType),
          w.map(({ item }) => item.sourceName),
          w.map(({ item }) => item.sourceBundle ?? null),
          w.map(({ item }) => item.startTime),
          w.map(({ item }) => item.endTime),
          w.map(({ item }) => item.durationSeconds),
          w.map(({ item }) => item.totalDistance ?? null),
          w.map(({ item }) => (item.totalDistance ? "mi" : null)),
          w.map(({ item }) => item.totalEnergyBurned ?? null),
          w.map(({ item }) => (item.totalEnergyBurned ? "kcal" : null)),
          w.map(({ item }) => item.statistics?.heartRateAvg ?? null),
          w.map(({ item }) => item.statistics?.heartRateMin ?? null),
          w.map(({ item }) => item.statistics?.heartRateMax ?? null),
          w.map(({ item }) => (item.metadata ? JSON.stringify(item.metadata) : null)),
          w.map(({ hash }) => hash),
          w.map(({ item }) => item.sampleUUID ?? null),
        ]);
        insertedWorkouts = result.rowCount ?? 0;
        skippedDuplicates += batch.workouts.length - insertedWorkouts;
      }

      // Delete records by sample UUID
      if (batch.deletedUUIDs && batch.deletedUUIDs.length > 0) {
        await client.query(
          "DELETE FROM health_raw WHERE sample_uuid = ANY($1)",
          [batch.deletedUUIDs]
        );
        await client.query(
          "DELETE FROM workouts WHERE sample_uuid = ANY($1)",
          [batch.deletedUUIDs]
        );
      }

      await client.query("COMMIT");

      console.log(
        `Sync from ${batch.deviceId}: ${insertedRecords} records, ${insertedWorkouts} workouts (${skippedDuplicates} duplicates)`
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({
      success: true,
      inserted: {
        records: insertedRecords,
        workouts: insertedWorkouts,
      },
      skippedDuplicates,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 }
    );
  }
}
