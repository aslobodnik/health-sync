import { NextResponse } from "next/server";
import { getDailySleep, getLastNightSleep } from "@/lib/queries";

export async function GET() {
  try {
    const [daily, lastNight] = await Promise.all([
      getDailySleep(365),
      getLastNightSleep(),
    ]);

    return NextResponse.json({
      daily,
      lastNight,
    });
  } catch (error) {
    console.error("Error fetching sleep:", error);
    return NextResponse.json(
      { error: "Failed to fetch sleep data" },
      { status: 500 }
    );
  }
}
