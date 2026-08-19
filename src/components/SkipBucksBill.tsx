"use client";

import type { CSSProperties } from "react";
import { useState } from "react";

const billStyle = (compact: boolean, open: boolean): CSSProperties => ({
  position: "relative",
  display: compact ? "inline-flex" : "grid",
  gridTemplateColumns: compact ? undefined : "18px minmax(0, 1fr) 18px",
  gridTemplateRows: compact ? "auto" : "auto auto",
  alignItems: "center",
  gap: compact ? 0 : undefined,
  columnGap: compact ? undefined : 7,
  width: compact ? "auto" : 132,
  minHeight: compact ? 18 : 54,
  padding: compact ? 0 : "7px 9px",
  overflow: compact ? "visible" : "hidden",
  border: compact ? "none" : "1px solid rgba(46,204,113,0.48)",
  borderRadius: compact ? 0 : 8,
  background: compact ? "transparent" : "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(201,255,222,0.96))",
  color: compact ? "#A7F3D0" : "#07351f",
  boxShadow: open
    ? "0 8px 18px rgba(0,0,0,0.2), 0 0 16px rgba(46,204,113,0.16)"
    : compact ? "none" : "0 7px 16px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(7,53,31,0.08)",
  cursor: "pointer",
  transform: compact ? "none" : open ? "rotate(0deg) translateY(-1px)" : "rotate(-1deg)",
  transition: "transform 160ms ease, box-shadow 160ms ease",
});

const cornerStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  gridRow: "1 / span 2",
  width: 17,
  height: 17,
  border: "1px solid rgba(7,53,31,0.25)",
  borderRadius: 999,
};

const sealStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  gridRow: "1 / span 2",
  display: "grid",
  placeItems: "center",
  width: 28,
  height: 28,
  borderRadius: 999,
  background: "#0b7b43",
  color: "#edfdf4",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: 0,
};

const popoverStyle: CSSProperties = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 10px)",
  width: "min(260px, calc(100vw - 32px))",
  padding: 16,
  border: "1px solid rgba(46,204,113,0.28)",
  borderRadius: 14,
  background: "#10241b",
  boxShadow: "0 18px 48px rgba(0,0,0,0.38)",
  textAlign: "left",
};

const compactPopoverStyle: CSSProperties = {
  ...popoverStyle,
  left: 0,
  right: "auto",
};

export function SkipBucksBill({
  amount,
  compact = false,
  onManage,
}: {
  amount: number;
  compact?: boolean;
  onManage?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const skipBucks = Math.max(0, Math.round(amount));

  return (
    <div className="skip-bucks-wrap" style={{ position: "relative", zIndex: 3, display: "inline-flex" }}>
      <button
        type="button"
        className={`skip-bucks-bill${compact ? " is-compact" : ""}`}
        style={billStyle(compact, open)}
        aria-expanded={open}
        aria-label={`${skipBucks.toLocaleString()} Skip Bucks. Open Skip Bucks explanation.`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {!compact && (
          <>
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 5,
                border: "1px dashed rgba(7,53,31,0.22)",
                borderRadius: 5,
                pointerEvents: "none",
              }}
            />
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "50%",
                top: -20,
                width: 54,
                height: 94,
                border: "1px solid rgba(46,204,113,0.22)",
                borderRadius: 999,
                transform: "translateX(-50%)",
                pointerEvents: "none",
              }}
            />
            <span className="skip-bucks-corner" style={cornerStyle} />
          </>
        )}
        <span
          className="skip-bucks-seal"
          style={compact ? {
            position: "relative",
            zIndex: 1,
            display: "inline-block",
            width: 42,
            height: 18,
            border: "1px solid rgba(167,243,208,0.52)",
            borderRadius: 3,
            background: "linear-gradient(135deg, #2ECC71, #0f8a4d)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
          } : sealStyle}
        >
          {compact ? (
            <>
              <span aria-hidden="true" style={{ position: "absolute", inset: 3, border: "1px solid rgba(237,245,240,0.45)", borderRadius: 2 }} />
              <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#EDF5F0", fontSize: 10, fontWeight: 900, letterSpacing: 0, fontVariantNumeric: "tabular-nums" }}>{skipBucks.toLocaleString()}</span>
            </>
          ) : "SB"}
        </span>
        {!compact && (
          <span
            className="skip-bucks-value"
            style={{
              position: "relative",
              zIndex: 1,
              minWidth: 0,
              fontSize: 22,
              fontWeight: 900,
              lineHeight: 1,
              textAlign: "center",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              letterSpacing: 0,
            }}
          >
            {skipBucks.toLocaleString()}
          </span>
        )}
        {!compact && (
          <>
            <span
              className="skip-bucks-code"
              style={{
                position: "relative",
                zIndex: 1,
                minWidth: 0,
                color: "rgba(7,53,31,0.72)",
                fontSize: 8,
                fontWeight: 900,
                letterSpacing: "0.08em",
                lineHeight: 1,
                textAlign: "center",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              Skip Bucks
            </span>
            <span className="skip-bucks-corner" style={cornerStyle} />
          </>
        )}
      </button>

      {open && (
        <div
          className="skip-bucks-popover iskip-pop-in"
          style={compact ? compactPopoverStyle : popoverStyle}
          role="dialog"
          aria-label="What are Skip Bucks?"
          onClick={(event) => event.stopPropagation()}
        >
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: compact ? undefined : 34,
              left: compact ? 16 : undefined,
              top: -6,
              width: 12,
              height: 12,
              borderLeft: "1px solid rgba(46,204,113,0.28)",
              borderTop: "1px solid rgba(46,204,113,0.28)",
              background: "#10241b",
              transform: "rotate(45deg)",
            }}
          />
          <button
            type="button"
            className="skip-bucks-close"
            style={{
              position: "absolute",
              right: 11,
              top: 8,
              color: "var(--text-muted)",
              fontSize: 16,
              fontWeight: 900,
              lineHeight: 1,
            }}
            aria-label="Close Skip Bucks explanation"
            onClick={() => setOpen(false)}
          >
            x
          </button>
          <p className="skip-bucks-popover-kicker" style={{ color: "var(--green-primary)", fontSize: 10, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" }}>Skip Bucks</p>
          <p className="skip-bucks-popover-copy" style={{ marginTop: 8, color: "var(--text-secondary)", fontSize: 12, fontWeight: 700, lineHeight: 1.45 }}>
            Skip Bucks are dollars available from your skipped expenses. They are your lifetime skipped savings minus purchases and donations you have logged.
          </p>
          {onManage && (
            <button
              type="button"
              className="skip-bucks-manage"
              style={{
                width: "100%",
                marginTop: 13,
                borderRadius: 10,
                padding: "9px 11px",
                background: "var(--green-primary)",
                color: "#071b14",
                fontSize: 12,
                fontWeight: 900,
              }}
              onClick={() => {
                setOpen(false);
                onManage();
              }}
            >
              Use Skip Bucks
            </button>
          )}
        </div>
      )}
    </div>
  );
}
