import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Slobo Health Dashboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // Fetch current stats (edge runtime can't use pg directly, so use API)
  let steps = "—";
  let rhr = "—";

  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://fit.justslobo.com";

    const [stepsRes, hrRes] = await Promise.all([
      fetch(`${baseUrl}/api/health/steps`),
      fetch(`${baseUrl}/api/health/heart-rate`),
    ]);

    if (stepsRes.ok) {
      const data = await stepsRes.json();
      steps = data.today?.toLocaleString() || "—";
    }
    if (hrRes.ok) {
      const data = await hrRes.json();
      rhr = data.latest?.toString() || "—";
    }
  } catch {
    // Use fallback values
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#09090b",
          fontFamily: "system-ui",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "40px",
          }}
        >
          <span style={{ color: "#10b981", fontSize: "32px" }}>◉</span>
          <span
            style={{
              fontSize: "28px",
              letterSpacing: "0.2em",
              color: "#a1a1aa",
              textTransform: "uppercase",
            }}
          >
            slobo health
          </span>
          <span style={{ color: "#10b981", fontSize: "32px" }}>◉</span>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "flex",
            gap: "80px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "72px",
                fontWeight: "bold",
                color: "#fafafa",
              }}
            >
              {steps}
            </span>
            <span
              style={{
                fontSize: "20px",
                color: "#71717a",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              steps today
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "72px",
                fontWeight: "bold",
                color: "#fafafa",
              }}
            >
              {rhr}
            </span>
            <span
              style={{
                fontSize: "20px",
                color: "#71717a",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              resting hr
            </span>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            fontSize: "16px",
            color: "#52525b",
            fontStyle: "italic",
          }}
        >
          keeping the meat suit running
        </div>
      </div>
    ),
    { ...size }
  );
}
