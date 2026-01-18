import { NextResponse } from "next/server";
import { getDailySteps, getDailyEnergy, getTodaySteps } from "@/lib/queries";

export async function GET() {
  try {
    const [daily, energy, today] = await Promise.all([
      getDailySteps(365),
      getDailyEnergy(30),
      getTodaySteps(),
    ]);

    return NextResponse.json({
      daily,
      energy,
      today,
    });
  } catch (error) {
    console.error("Error fetching steps:", error);
    return NextResponse.json(
      { error: "Failed to fetch steps data" },
      { status: 500 }
    );
  }
}
