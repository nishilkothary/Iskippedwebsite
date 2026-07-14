"use client";
import { buildWhatsAppShareUrl, buildXShareUrl } from "@/lib/utils/share";

interface Props {
  url: string;
  text: string;
}

export function ShareLinksRow({ url, text }: Props) {
  return (
    <div className="flex gap-2">
      <a
        href={buildWhatsAppShareUrl(text, url)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 py-2 rounded-xl text-xs font-black text-center"
        style={{ background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.3)", color: "#25D366" }}
      >
        WhatsApp
      </a>
      <a
        href={buildXShareUrl(text, url)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 py-2 rounded-xl text-xs font-black text-center"
        style={{ background: "var(--bg-surface-3)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
      >
        Share on X
      </a>
    </div>
  );
}
