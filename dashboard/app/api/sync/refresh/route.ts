import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Manual refresh escape hatch. Normal freshness comes from the NUC cron
// (REFRESH MATERIALIZED VIEW CONCURRENTLY daily_metrics every 10 minutes).
export async function POST(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const start = Date.now();
    await pool.query("REFRESH MATERIALIZED VIEW CONCURRENTLY daily_metrics");
    return NextResponse.json({ success: true, refreshedIn: Date.now() - start });
  } catch (error) {
    console.error("Refresh error:", error);
    return NextResponse.json(
      { error: "Refresh failed", details: String(error) },
      { status: 500 }
    );
  }
}
