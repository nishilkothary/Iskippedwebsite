import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const MAX_LABEL_LENGTH = 60;

function clamp(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawAmount = Number(searchParams.get("amount"));
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;
  const item = clamp(searchParams.get("item") || "something", MAX_LABEL_LENGTH);
  const cause = searchParams.get("cause") ? clamp(searchParams.get("cause")!, MAX_LABEL_LENGTH) : null;
  const formattedAmount = `$${amount.toFixed(2)}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B1A14",
          padding: "0 90px",
        }}
      >
        <p style={{ fontSize: 34, fontWeight: 700, color: "rgba(237,245,240,0.6)", margin: 0, textAlign: "center" }}>
          I skipped {item}
        </p>
        <p style={{ fontSize: 92, fontWeight: 900, color: "#2ECC71", margin: "18px 0", textAlign: "center" }}>
          {formattedAmount} saved
        </p>
        {cause && (
          <p style={{ fontSize: 36, fontWeight: 700, color: "#EDF5F0", margin: 0, textAlign: "center" }}>
            for {cause}
          </p>
        )}
        <p style={{ fontSize: 28, fontWeight: 900, margin: 0, marginTop: 64 }}>
          <span style={{ color: "#EDF5F0" }}>i</span>
          <span style={{ color: "#2ECC71" }}>skipped</span>
        </p>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
