import { NextResponse } from "next/server";
import { STEP_COUNT, getLatestDailyTotal } from "@/lib/queries";

// Consumed only by opengraph-image.tsx (edge runtime cannot use pg directly)
export async function GET() {
  try {
    const today = await getLatestDailyTotal(STEP_COUNT);
    return NextResponse.json({ today });
  } catch (error) {
    console.error("Error fetching steps:", error);
    return NextResponse.json(
      { error: "Failed to fetch steps data" },
      { status: 500 }
    );
  }
}
