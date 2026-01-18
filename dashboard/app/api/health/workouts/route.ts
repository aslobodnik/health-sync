import { NextResponse } from "next/server";
import { getRecentWorkouts } from "@/lib/queries";

export async function GET() {
  try {
    const workouts = await getRecentWorkouts(10);

    return NextResponse.json({ workouts });
  } catch (error) {
    console.error("Error fetching workouts:", error);
    return NextResponse.json(
      { error: "Failed to fetch workouts data" },
      { status: 500 }
    );
  }
}
