"use client";
import { useEffect, useState } from "react";
import { useProjects } from "@/hooks/useProjects";
import { useAuthStore } from "@/store/authStore";
import { useSkips } from "@/hooks/useSkips";
import { setActiveProject } from "@/lib/services/firebase/users";
import { formatCurrency } from "@/lib/utils/currency";
import { DonationLogModal } from "@/components/skip/DonationLogModal";
import { EditDonationModal } from "@/components/skip/EditDonationModal";
import { DonationEvent } from "@/lib/types/models";

const CFC_TITLE = "Caring for Cambodia";

export default function CausesPage() {
  const { projects, loading } = useProjects();
  const { user, profile, updateProfile } = useAuthStore();
  const { donations } = useSkips();
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [editingDonation, setEditingDonation] = useState<DonationEvent | null>(null);

  const cfcProject = projects.find((p) => p.title === CFC_TITLE || p.title?.includes("Cambodia"));

  useEffect(() => {
    if (!user || !cfcProject || profile?.activeProjectId === cfcProject.id) return;
    setActiveProject(user.uid, cfcProject.id);
    updateProfile({ activeProjectId: cfcProject.id });
  }, [cfcProject?.id, user?.uid]);

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
        <h1 className="text-2xl font-bold text-[#111827]">Caring for Cambodia</h1>
        <p className="text-[#3D8B68] font-medium mt-0.5">Educating the children of Cambodia</p>
        <p className="text-[#6B7280] text-sm mt-3 leading-relaxed">
          {cfcProject?.description ||
            "Caring for Cambodia has provided free, quality education to thousands of Cambodian children since 2003. 100% of funds go directly to students."}
        </p>
        <a
          href="https://www.caringforcambodia.org"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-[#3D8B68] font-medium mt-2 hover:underline"
        >
          Learn more → caringforcambodia.org
        </a>
      </div>

      {/* $300 fact card */}
      <div className="bg-[#3D8B68] rounded-2xl p-6 mb-6 text-white">
        <div className="flex items-center gap-3">
          <span className="text-4xl">🎓</span>
          <div>
            <p className="text-2xl font-bold">$300 = 1 child educated</p>
            <p className="text-[#B7D9C6] text-sm mt-0.5">for a full year</p>
          </div>
        </div>
      </div>

      {/* Pledged vs Donated */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-4 border-[#3D8B68] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-5 border border-[#E5E7EB] shadow-sm">
            <p className="text-xs text-[#6B7280] uppercase tracking-wide mb-1">Total Pledged</p>
            <p className="text-3xl font-bold text-[#3D8B68]">{formatCurrency(profile?.totalDonated ?? 0)}</p>
            <p className="text-xs text-[#9CA3AF] mt-1">via skip splits</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-[#E5E7EB] shadow-sm">
            <p className="text-xs text-[#6B7280] uppercase tracking-wide mb-1">Total Donated</p>
            <p className="text-3xl font-bold text-[#3D8B68]">{formatCurrency(profile?.totalDonated ?? 0)}</p>
            <p className="text-xs text-[#9CA3AF] mt-1">to caringforcambodia.org</p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-3 mb-8">
        <a
          href="https://www.caringforcambodia.org/donate"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-[#3D8B68] hover:bg-[#2D6A4F] text-white font-bold py-4 rounded-2xl text-center text-base transition-colors"
        >
          Donate Now ↗
        </a>
        <button
          onClick={() => setShowDonationModal(true)}
          className="w-full border-2 border-[#3D8B68] text-[#3D8B68] font-semibold py-4 rounded-2xl text-base hover:bg-[#E4F0E8] transition-colors"
        >
          I Made a Donation
        </button>
      </div>

      {/* Donation log */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-[#111827] mb-3">Donation Activity</h2>
        {donations.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-[#E5E7EB]">
            <p className="text-[#9CA3AF] text-sm">No donations logged yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {donations.map((donation) => (
              <div key={donation.id} className="bg-white rounded-xl px-4 py-3 border border-[#E5E7EB] flex items-center gap-3">
                <span className="text-xl flex-shrink-0">💚</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#111827] truncate">
                    Donated to {donation.causeTitle}
                  </p>
                  <p className="text-xs text-[#9CA3AF]">
                    {formatDonationDate(donation)}
                  </p>
                </div>
                <span className="text-sm font-bold text-[#3D8B68] flex-shrink-0">{formatCurrency(donation.amount)}</span>
                <button
                  onClick={() => setEditingDonation(donation)}
                  className="text-[#9CA3AF] hover:text-[#3D8B68] transition-colors flex-shrink-0 p-1"
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
          projectTitle={cfcProject?.title ?? "Caring for Cambodia"}
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
