"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { buildSmsShareUrl, buildWhatsAppShareUrl, buildXShareUrl } from "@/lib/utils/share";

interface Props {
  /** Final share URL (already includes any ?ref= param the caller wants). */
  url: string;
  /** Message text WITHOUT the trailing URL — the share targets append/attach the URL themselves. */
  text: string;
  /** Title passed to the native share sheet. */
  title?: string;
  /** Optional image (e.g. a brag card) to attach to the native share sheet when the browser supports it. */
  imageUrl?: string;
  /** "block" = full-width button (modals/sheets). "pill" = compact rounded pill (inline headers). */
  variant?: "block" | "pill";
  /** "primary" gives the block variant a prominent green CTA look (hero share). */
  tone?: "default" | "primary";
  /** Button label. Defaults to "Share". */
  label?: string;
}

const MENU_ITEM: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 800,
  color: "var(--text-primary)",
  background: "transparent",
  textAlign: "left",
  whiteSpace: "nowrap",
};

export function ShareButton({ url, text, title, imageUrl, variant = "block", tone = "default", label = "Share" }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function handleClick() {
    // On devices with a native share sheet (mostly mobile), that sheet already lists
    // WhatsApp / Messages / X / etc. — so one tap is all we need.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      // Best-effort: attach the brag-card image so it lands directly in the friend's chat.
      let files: File[] | undefined;
      if (imageUrl) {
        try {
          const res = await fetch(imageUrl);
          if (res.ok) {
            const blob = await res.blob();
            const file = new File([blob], "iskipped.png", { type: blob.type || "image/png" });
            if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
              files = [file];
            }
          }
        } catch {
          // Couldn't fetch/attach — fall back to link-only share below.
        }
      }
      try {
        await navigator.share(files ? { title: title ?? "iSkipped", text, url, files } : { title: title ?? "iSkipped", text, url });
        return;
      } catch {
        return; // user dismissed
      }
    }
    // Desktop fallback: show an explicit menu of targets.
    setOpen((v) => !v);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  const triggerStyle: CSSProperties =
    variant === "pill"
      ? {
          background: "rgba(46,204,113,0.12)",
          border: "1px solid rgba(46,204,113,0.25)",
          borderRadius: 999,
          color: "var(--green-primary)",
          fontSize: 11,
          fontWeight: 900,
          padding: "6px 10px",
          whiteSpace: "nowrap",
        }
      : tone === "primary"
      ? {
          width: "100%",
          background: "linear-gradient(135deg, var(--green-cta), var(--green-grad-end))",
          border: "none",
          borderRadius: 12,
          color: "#0B1A14",
          fontSize: 15,
          fontWeight: 900,
          padding: "13px 12px",
        }
      : {
          width: "100%",
          background: "var(--bg-surface-3)",
          border: "1px solid var(--border-default)",
          borderRadius: 12,
          color: "var(--text-primary)",
          fontSize: 13,
          fontWeight: 900,
          padding: "10px 12px",
        };

  return (
    <div ref={wrapRef} style={{ position: "relative", display: variant === "pill" ? "inline-block" : "block" }}>
      <button type="button" onClick={handleClick} style={triggerStyle} aria-haspopup="menu" aria-expanded={open}>
        ↗ {label}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: variant === "pill" ? 0 : undefined,
            left: variant === "pill" ? undefined : 0,
            minWidth: 190,
            zIndex: 60,
            background: "var(--bg-surface-1)",
            border: "1px solid var(--border-default)",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            overflow: "hidden",
            padding: 4,
          }}
        >
          <a
            href={buildWhatsAppShareUrl(text, url)}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            style={{ ...MENU_ITEM, color: "#25D366" }}
          >
            <span style={{ fontSize: 15 }}>💬</span> WhatsApp
          </a>
          <a
            href={buildXShareUrl(text, url)}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            style={MENU_ITEM}
          >
            <span style={{ fontSize: 15 }}>𝕏</span> Post on X
          </a>
          <a
            href={buildSmsShareUrl(text, url)}
            role="menuitem"
            onClick={() => setOpen(false)}
            style={MENU_ITEM}
          >
            <span style={{ fontSize: 15 }}>✉️</span> Text message
          </a>
          <button type="button" role="menuitem" onClick={copyLink} style={MENU_ITEM}>
            <span style={{ fontSize: 15 }}>🔗</span> {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
