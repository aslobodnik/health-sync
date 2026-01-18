import { NextResponse } from "next/server";
import { getSwimmingByYear, getRecentSwims } from "@/lib/queries";

export async function GET() {
  try {
    const [yearly, recentSwims] = await Promise.all([
      getSwimmingByYear(),
      getRecentSwims(5),
    ]);

    return NextResponse.json({ yearly, recentSwims });
  } catch (error) {
    console.error("Error fetching swimming:", error);
    return NextResponse.json(
      { error: "Failed to fetch swimming data" },
      { status: 500 }
    );
  }
}
