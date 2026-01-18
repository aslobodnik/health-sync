import { NextResponse } from "next/server";
import { getSportsSummary } from "@/lib/queries";

export async function GET() {
  try {
    const sports = await getSportsSummary();
    return NextResponse.json({ sports });
  } catch (error) {
    console.error("Error fetching sports:", error);
    return NextResponse.json({ error: "Failed to fetch sports data" }, { status: 500 });
  }
}
