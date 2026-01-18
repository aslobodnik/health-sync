import { NextResponse } from "next/server";
import { getRestingHeartRate } from "@/lib/queries";

export async function GET() {
  try {
    const rhr = await getRestingHeartRate();

    return NextResponse.json({
      latest: rhr?.latest ?? null,
      avg_7d: rhr?.avg_7d ?? null,
    });
  } catch (error) {
    console.error("Error fetching heart rate:", error);
    return NextResponse.json(
      { error: "Failed to fetch heart rate data" },
      { status: 500 }
    );
  }
}
