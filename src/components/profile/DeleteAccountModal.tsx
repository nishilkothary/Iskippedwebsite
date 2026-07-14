"use client";
import { useState } from "react";

interface Props {
  onClose: () => void;
  onConfirmed: () => Promise<void>;
}

export function DeleteAccountModal({ onClose, onConfirmed }: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const canDelete = confirmText.trim().toUpperCase() === "DELETE";

  async function handleDelete() {
    if (!canDelete || deleting) return;
    setDeleting(true);
    try {
      await onConfirmed();
    } catch {
      // Parent already surfaced a toast — keep the dialog open so the user can retry.
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={deleting ? undefined : onClose}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-md"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Delete account</h2>
          {!deleting && (
            <button onClick={onClose} className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
          )}
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            This permanently deletes your account, skips, donations, spending history, and custom causes.
            This cannot be undone.
          </p>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Type <span className="font-bold">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={deleting}
              autoFocus
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
              style={{
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
            style={{ border: "1px solid var(--border-emphasis)", color: "var(--text-secondary)", background: "transparent" }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="flex-1 py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "#ef4444", color: "#fff" }}
          >
            {deleting ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </div>
    </div>
  );
}
