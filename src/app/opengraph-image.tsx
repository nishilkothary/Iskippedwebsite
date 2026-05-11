import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
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
        }}
      >
        <p style={{ fontSize: 96, fontWeight: 900, margin: 0, letterSpacing: "-2px" }}>
          <span style={{ color: "#EDF5F0" }}>i</span>
          <span style={{ color: "#2ECC71" }}>skipped</span>
        </p>
        <p style={{ fontSize: 32, color: "rgba(237,245,240,0.55)", margin: "16px 0 0", fontWeight: 600 }}>
          Save money. Change lives.
        </p>
      </div>
    ),
    { ...size }
  );
}
