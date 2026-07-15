import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const MAX_LABEL_LENGTH = 42;

function clamp(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const rawAmount = Number(searchParams.get("amount"));
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;
  const item = clamp(searchParams.get("item") || "something", MAX_LABEL_LENGTH);
  const cause = searchParams.get("cause") ? clamp(searchParams.get("cause")!, MAX_LABEL_LENGTH) : null;
  const formattedAmount = `$${amount.toFixed(2)}`;
  const logoUrl = `${origin}/logo.png`;

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
          background: "radial-gradient(circle at 50% -10%, #17352A 0%, #0B1A14 60%)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -140,
            left: -130,
            width: 420,
            height: 420,
            borderRadius: "50%",
            background: "rgba(46,204,113,0.16)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -170,
            right: -130,
            width: 460,
            height: 460,
            borderRadius: "50%",
            background: "rgba(46,204,113,0.10)",
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 840,
            background: "#FFFFFF",
            borderRadius: 32,
            padding: "40px 64px 44px",
            boxShadow: "0 40px 80px rgba(0,0,0,0.4)",
          }}
        >
          <img src={logoUrl} width={200} height={79} style={{ objectFit: "contain" }} alt="" />

          <p
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#5C6B67",
              margin: 0,
              marginTop: 24,
              textAlign: "center",
              maxWidth: 680,
              lineHeight: 1.25,
            }}
          >
            I skipped {item}
          </p>

          <p
            style={{
              fontSize: 100,
              fontWeight: 900,
              color: "#2ECC71",
              margin: 0,
              marginTop: 6,
              letterSpacing: -3,
              lineHeight: 1,
            }}
          >
            {formattedAmount}
          </p>
          <p
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: "#8A968F",
              margin: 0,
              marginTop: 6,
              textTransform: "uppercase",
              letterSpacing: 6,
            }}
          >
            saved
          </p>

          {cause && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 22,
                padding: "10px 26px",
                borderRadius: 999,
                background: "rgba(46,204,113,0.12)",
                border: "2px solid rgba(46,204,113,0.35)",
              }}
            >
              <p style={{ fontSize: 24, margin: 0, display: "flex" }}>💚</p>
              <p
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: "#146238",
                  margin: 0,
                  maxWidth: 500,
                  textAlign: "center",
                  lineHeight: 1.25,
                }}
              >
                for {cause}
              </p>
            </div>
          )}
        </div>

        <p
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "rgba(237,245,240,0.5)",
            margin: 0,
            marginTop: 28,
            letterSpacing: 3,
          }}
        >
          iskipped.com
        </p>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
