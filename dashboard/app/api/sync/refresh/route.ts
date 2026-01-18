import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

const API_SECRET = process.env.SYNC_API_SECRET || "CHANGE_ME";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = await pool.connect();
    try {
      const start = Date.now();
      await client.query("REFRESH MATERIALIZED VIEW CONCURRENTLY daily_metrics");
      const duration = Date.now() - start;

      console.log(`Materialized view refreshed in ${duration}ms`);

      return NextResponse.json({
        success: true,
        refreshedIn: duration,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Refresh error:", error);
    return NextResponse.json(
      { error: "Refresh failed", details: String(error) },
      { status: 500 }
    );
  }
}
