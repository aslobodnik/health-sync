import { NextRequest, NextResponse } from "next/server";

const API_SECRET = process.env.SYNC_API_SECRET || "CHANGE_ME";

// Returns an error response, or null when the bearer token is valid
export function requireAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
