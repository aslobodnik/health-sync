import { NextResponse } from "next/server";
import { getYearOverYearSteps, getYearOverYearEnergy } from "@/lib/queries";

export async function GET() {
  try {
    const [stepsCumulative, energyCumulative] = await Promise.all([
      getYearOverYearSteps(),
      getYearOverYearEnergy(),
    ]);

    return NextResponse.json({
      stepsCumulative,
      energyCumulative,
    });
  } catch (error) {
    console.error("Error fetching comparison data:", error);
    return NextResponse.json(
      { error: "Failed to fetch comparison data" },
      { status: 500 }
    );
  }
}
