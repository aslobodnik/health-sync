import { NextResponse } from "next/server";
import { getPeriodComparisons, getDailyHRV, getDailyRHR, getLatestVO2Max } from "@/lib/queries";

export async function GET() {
  try {
    const [comparisons, hrv, rhr, vo2max] = await Promise.all([
      getPeriodComparisons(),
      getDailyHRV(30),
      getDailyRHR(30),
      getLatestVO2Max(),
    ]);

    const steps = comparisons.find(c => c.metric === "steps");
    const energy = comparisons.find(c => c.metric === "active_energy");

    return NextResponse.json({
      steps,
      energy,
      hrv,
      rhr,
      vo2max,
    });
  } catch (error) {
    console.error("Error fetching period data:", error);
    return NextResponse.json(
      { error: "Failed to fetch period data" },
      { status: 500 }
    );
  }
}
