import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import pool from "@/lib/db";

// Simple bearer token auth - set in environment
const API_SECRET = process.env.SYNC_API_SECRET || "CHANGE_ME";

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

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const batch: SyncBatch = await request.json();
    let insertedRecords = 0;
    let insertedWorkouts = 0;
    let skippedDuplicates = 0;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Insert health records
      if (batch.records && batch.records.length > 0) {
        for (const record of batch.records) {
          const hash = generateRecordHash(record);

          const result = await client.query(
            `INSERT INTO health_raw (
              record_type, source_name, source_bundle_id, unit,
              value_numeric, value_text, start_time, end_time,
              metadata, record_hash
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (record_hash) DO NOTHING
            RETURNING id`,
            [
              record.recordType,
              record.sourceName,
              record.sourceBundle,
              record.unit,
              record.value,
              record.valueText,
              record.startTime,
              record.endTime,
              record.metadata ? JSON.stringify(record.metadata) : null,
              hash,
            ]
          );

          if (result.rowCount && result.rowCount > 0) {
            insertedRecords++;
          } else {
            skippedDuplicates++;
          }
        }
      }

      // Insert workouts
      if (batch.workouts && batch.workouts.length > 0) {
        for (const workout of batch.workouts) {
          const hash = generateWorkoutHash(workout);

          const result = await client.query(
            `INSERT INTO workouts (
              workout_type, source_name, source_bundle_id,
              start_time, end_time, duration_seconds,
              total_distance, total_distance_unit,
              total_energy_burned, total_energy_unit,
              avg_heart_rate, min_heart_rate, max_heart_rate,
              metadata, workout_hash
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (workout_hash) DO NOTHING
            RETURNING id`,
            [
              workout.workoutType,
              workout.sourceName,
              workout.sourceBundle,
              workout.startTime,
              workout.endTime,
              workout.durationSeconds,
              workout.totalDistance,
              workout.totalDistance ? "mi" : null,
              workout.totalEnergyBurned,
              workout.totalEnergyBurned ? "kcal" : null,
              workout.statistics?.heartRateAvg,
              workout.statistics?.heartRateMin,
              workout.statistics?.heartRateMax,
              workout.metadata ? JSON.stringify(workout.metadata) : null,
              hash,
            ]
          );

          if (result.rowCount && result.rowCount > 0) {
            insertedWorkouts++;
          } else {
            skippedDuplicates++;
          }
        }
      }

      await client.query("COMMIT");

      console.log(
        `Sync from ${batch.deviceId}: ${insertedRecords} records, ${insertedWorkouts} workouts (${skippedDuplicates} duplicates)`
      );

      return NextResponse.json({
        success: true,
        inserted: {
          records: insertedRecords,
          workouts: insertedWorkouts,
        },
        skippedDuplicates,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "sync" });
}
