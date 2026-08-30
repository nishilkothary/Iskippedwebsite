"use client";

import { useState } from "react";
import type { Project } from "@/lib/types/models";
import { apiRequest } from "@/lib/services/firebase/apiClient";
import type { FundraiserDetailField } from "@/lib/utils/fundraiserDetails";

const fields: { key: FundraiserDetailField; label: string; type?: string }[] = [
  { key: "donationURL", label: "Donation link", type: "url" },
  { key: "donationNote", label: "Donation instructions (if there is no link)" },
  { key: "title", label: "Fundraiser name" },
  { key: "groupName", label: "Group name" },
  { key: "sponsor", label: "Organizer" },
  { key: "description", label: "Description" },
  { key: "location", label: "Location" },
  { key: "goalAmount", label: "Fundraising goal ($)", type: "number" },
  { key: "learnMoreURL", label: "Learn more link", type: "url" },
  { key: "imageURL", label: "Image URL or path" },
  { key: "imagePosition", label: "Image position (for example, center or 50% 50%)" },
  { key: "unitName", label: "Impact unit (singular)" },
  { key: "unitDisplay", label: "Impact unit (plural)" },
  { key: "unitCost", label: "Cost per impact unit ($)", type: "number" },
];

export function FundraiserDetailsEditor({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function startEditing() {
    const initial = Object.fromEntries(fields.map(({ key }) => [key, String(project[key] ?? "")]));
    initial.visibility = project.visibility ?? "public";
    setValues(initial);
    setOriginal(initial);
    setError("");
    setSaved(false);
    setEditing(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const updates = Object.fromEntries(Object.entries(values)
      .filter(([key, value]) => value !== original[key])
      .map(([key, value]) => [key, key === "goalAmount" || key === "unitCost"
        ? value.trim() ? Number(value) : key === "goalAmount" ? 0 : null
        : value.trim() || null]));
    if (!Object.keys(updates).length) { setEditing(false); return; }
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/api/challenges/${project.id}/details`, "PATCH", updates);
      setSaved(true);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save fundraiser details.");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { background: "var(--bg-surface-1)", color: "var(--text-primary)", border: "1px solid var(--border-default)" };
  const renderField = ({ key, label, type }: typeof fields[number]) => (
            <label key={key} className="block text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
              {label}
              {key === "description" ? (
                <textarea rows={3} value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} disabled={saving}
                  className="block w-full mt-1 rounded-lg px-3 py-2 text-sm" style={inputStyle} />
              ) : (
                <input type={type ?? "text"} value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                  required={key === "title"} disabled={saving} autoFocus={key === "donationURL"}
                  min={type === "number" ? key === "unitCost" ? 0.0001 : 0 : undefined} step={type === "number" ? "any" : undefined}
                  placeholder={key === "donationURL" ? "https://…" : undefined}
                  className="block w-full mt-1 rounded-lg px-3 py-2 text-sm" style={inputStyle} />
              )}
            </label>
  );
  return (
    <section className="rounded-2xl p-4 mb-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
      <h2 className="text-sm font-bold mb-2" style={{ color: "var(--text-primary)" }}>Fundraiser details</h2>
      {saved && <p role="status" className="text-sm mb-3" style={{ color: "var(--green-primary)" }}>Fundraiser details saved.</p>}
      {!editing ? (
        <>
          <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Current donation link</p>
          <p className="text-sm break-all mb-3" style={{ color: "var(--text-primary)" }}>{project.donationURL || "No donation link set"}</p>
          <button type="button" onClick={startEditing} className="w-full py-2.5 rounded-xl text-sm font-bold"
            style={{ background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))", color: "var(--bg-base)" }}>
            Edit Fundraiser Details
          </button>
        </>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Update the donation link or other details here. Only changed fields are saved.</p>
          {fields.slice(0, 2).map(renderField)}
          <details className="space-y-3">
            <summary className="cursor-pointer text-sm font-bold" style={{ color: "var(--text-secondary)" }}>Other fundraiser details</summary>
            {fields.slice(2).map(renderField)}
          <label className="block text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
            Access
            <select value={values.visibility} onChange={(e) => setValues({ ...values, visibility: e.target.value })} disabled={saving}
              className="block w-full mt-1 rounded-lg px-3 py-2 text-sm" style={inputStyle}>
              <option value="public">Public</option><option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              {original.visibility === "password" && <option value="password">Password protected</option>}
            </select>
          </label>
          </details>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-50"
              style={{ background: "var(--green-primary)", color: "var(--bg-base)" }}>{saving ? "Saving…" : "Save Changes"}</button>
            <button type="button" disabled={saving} onClick={() => setEditing(false)} className="rounded-xl px-4 text-sm" style={inputStyle}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
