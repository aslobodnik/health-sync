import { NextResponse } from "next/server";
import { getComparisons } from "@/lib/queries";

export async function GET() {
  try {
    const comparisons = await getComparisons();
    return NextResponse.json({ comparisons });
  } catch (error) {
    console.error("Error fetching comparisons:", error);
    return NextResponse.json({ error: "Failed to fetch comparison data" }, { status: 500 });
  }
}
