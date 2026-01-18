import { NextResponse } from "next/server";
import { getWeeklyZone2 } from "@/lib/queries";

export async function GET() {
  try {
    const weekly = await getWeeklyZone2(52);

    return NextResponse.json({ weekly });
  } catch (error) {
    console.error("Error fetching zone 2:", error);
    return NextResponse.json(
      { error: "Failed to fetch zone 2 data" },
      { status: 500 }
    );
  }
}
