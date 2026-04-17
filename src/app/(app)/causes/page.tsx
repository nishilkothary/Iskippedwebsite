"use client";
import { useState } from "react";
import { useProjects } from "@/hooks/useProjects";
import { useAuthStore } from "@/store/authStore";
import { useSkips } from "@/hooks/useSkips";
import { formatCurrency } from "@/lib/utils/currency";
import { DonationLogModal } from "@/components/skip/DonationLogModal";
import { EditDonationModal } from "@/components/skip/EditDonationModal";
import { DonationEvent } from "@/lib/types/models";

export default function CausesPage() {
  const { projects, loading } = useProjects();
  const { user, profile } = useAuthStore();
  const { donations } = useSkips();
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [editingDonation, setEditingDonation] = useState<DonationEvent | null>(null);

  const cfcProject = projects.find((p) => p.id === "cfc" || p.title?.includes("Student") || p.title?.includes("Cambodia"));
  const availableToDonate = (profile?.totalSaved ?? 0) - (profile?.totalDonated ?? 0);

function formatDonationDate(donation: DonationEvent): string {
    if (donation.date) return donation.date;
    if (donation.donatedAt?.toDate) {
      return donation.donatedAt.toDate().toISOString().slice(0, 10);
    }
    return "";
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-20 md:pb-8">
      {/* Org header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{cfcProject?.title ?? "A Student's Education"}</h1>
        <p className="font-medium mt-0.5" style={{ color: "var(--green-primary)" }}>{cfcProject?.sponsor ?? "Caring for Cambodia"}{cfcProject?.location ? ` · ${cfcProject.location}` : ""}</p>
        <p className="text-sm mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {cfcProject?.description ||
            "Your savings fund a full year of quality education for a child in Cambodia, including tuition, uniforms, and school supplies."}
        </p>
        <a
          href="https://www.caringforcambodia.org"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-medium mt-2 hover:underline"
          style={{ color: "var(--green-primary)" }}
        >
          Learn more → caringforcambodia.org
        </a>
      </div>

      {/* $300 fact card */}
      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: "linear-gradient(135deg, var(--coral-primary), var(--coral-dark))", color: "#fff" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-4xl">🎓</span>
          <div>
            <p className="text-2xl font-bold">$300 = 1 child educated</p>
            <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.75)" }}>for a full year</p>
          </div>
        </div>
      </div>

      {/* Available to donate */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--green-primary)", borderTopColor: "transparent" }} />
        </div>
      ) : (
        <div className="rounded-2xl p-5 mb-6" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
          <p className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Available to Donate</p>
          <p className="text-3xl font-bold" style={{ color: "var(--coral-primary)" }}>{formatCurrency(Math.max(0, availableToDonate))}</p>
          {profile && profile.totalDonated > 0 && (
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{formatCurrency(profile.totalDonated)} donated so far</p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-3 mb-8">
        <a
          href="https://www.caringforcambodia.org/donate"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full font-bold py-4 rounded-2xl text-center text-base transition-all hover:scale-[1.01]"
          style={{
            background: "linear-gradient(135deg, var(--coral-primary), var(--coral-dark))",
            color: "#fff",
            boxShadow: "0 4px 18px rgba(232,99,122,0.3)",
          }}
        >
          Donate Now ↗
        </a>
        <button
          onClick={() => setShowDonationModal(true)}
          className="w-full font-semibold py-4 rounded-2xl text-base transition-colors"
          style={{
            border: "2px solid var(--coral-primary)",
            color: "var(--coral-primary)",
          }}
        >
          I Made a Donation
        </button>
      </div>

      {/* Donation log */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Donation Activity</h2>
        {donations.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No donations logged yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {donations.map((donation) => (
              <div key={donation.id} className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}>
                <span className="text-xl flex-shrink-0">💚</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    Donated to {donation.causeTitle}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatDonationDate(donation)}
                  </p>
                </div>
                <span className="text-sm font-bold flex-shrink-0" style={{ color: "var(--coral-primary)" }}>{formatCurrency(donation.amount)}</span>
                <button
                  onClick={() => setEditingDonation(donation)}
                  className="transition-colors flex-shrink-0 p-1"
                  style={{ color: "var(--text-muted)" }}
                  title="Edit donation"
                >
                  ✏️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showDonationModal && (
        <DonationLogModal
          projectId={cfcProject?.id ?? "caring-for-cambodia"}
          projectTitle={cfcProject?.title ?? "A Student's Yearly Education"}
          onClose={() => setShowDonationModal(false)}
        />
      )}
      {editingDonation && (
        <EditDonationModal
          donation={editingDonation}
          onClose={() => setEditingDonation(null)}
        />
      )}
    </div>
  );
}
