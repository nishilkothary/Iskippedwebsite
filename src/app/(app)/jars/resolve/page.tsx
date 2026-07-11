"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { recordDonation, transferJarBalance } from "@/lib/services/firebase/users";
import { formatCurrency } from "@/lib/utils/currency";
import { getChallengeCountdown } from "@/lib/utils/dates";
import { isChallengeProject } from "@/lib/services/firebase/projects";

export default function JarResolvePage() {
  const router = useRouter();
  const { user, profile, updateProfile } = useAuthStore();
  const { projects } = useProjects();

  const activeId = profile?.activeProjectId ?? null;
  const jarBalances = profile?.causeJarBalances ?? {};

  const parkedJars = Object.entries(jarBalances)
    .filter(([id, bal]) => id !== activeId && bal > 0)
    .map(([id, bal]) => {
      const project = projects.find((p) => p.id === id) ?? null;
      return { id, balance: bal, project };
    });

  if (parkedJars.length === 0) {
    return (
      <main className="min-h-screen p-4 max-w-lg mx-auto pb-24">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
          >
            ←
          </button>
          <p className="text-lg font-black" style={{ color: "var(--text-primary)" }}>Jars</p>
        </div>
        <div className="rounded-2xl p-6 text-center" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
          <p className="text-2xl mb-2">✓</p>
          <p className="text-base font-black" style={{ color: "var(--text-primary)" }}>All caught up!</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>No jars waiting for action.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
        >
          ←
        </button>
        <div>
          <p className="text-lg font-black" style={{ color: "var(--text-primary)" }}>Jars with money</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{parkedJars.length} jar{parkedJars.length !== 1 ? "s" : ""} waiting for action</p>
        </div>
      </div>

      <div className="space-y-4">
        {parkedJars.map(({ id, balance, project }) => (
          <ParkedJarCard
            key={id}
            jarId={id}
            balance={balance}
            project={project}
            activeId={activeId}
            allProjects={projects}
            uid={user?.uid ?? ""}
            onResolved={(updates) => {
              updateProfile({ causeJarBalances: { ...jarBalances, ...updates } });
            }}
            onDonate={(donationBalance) => {
              updateProfile({
                totalDonated: (profile?.totalDonated ?? 0) + donationBalance,
                causeJarBalances: { ...jarBalances, [id]: 0 },
              });
            }}
          />
        ))}
      </div>
    </main>
  );
}

function ParkedJarCard({
  jarId,
  balance,
  project,
  activeId,
  allProjects,
  uid,
  onResolved,
  onDonate,
}: {
  jarId: string;
  balance: number;
  project: ReturnType<typeof useProjects>["projects"][number] | null;
  activeId: string | null;
  allProjects: ReturnType<typeof useProjects>["projects"];
  uid: string;
  onResolved: (updates: Record<string, number>) => void;
  onDonate: (amount: number) => void;
}) {
  const [donating, setDonating] = useState(false);
  const [donateConfirm, setDonateConfirm] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [showTransferPicker, setShowTransferPicker] = useState(false);
  const [resolved, setResolved] = useState(false);

  const countdown = project ? getChallengeCountdown(project) : null;
  const isChallenge = project ? isChallengeProject(project) : false;
  const title = project?.title ?? `Jar (${jarId.slice(0, 6)}...)`;
  const donationURL = project?.donationURL;

  const transferTargets = allProjects.filter(
    (p) => p.id !== jarId && (p.id === activeId || p.isCustom)
  );

  async function handleDonate() {
    if (!donationURL) return;
    window.open(donationURL, "_blank", "noopener,noreferrer");
    setDonateConfirm(true);
  }

  async function handleMarkDonated() {
    setDonating(true);
    try {
      await recordDonation(uid, balance, jarId, title);
      onDonate(balance);
      setResolved(true);
    } catch (err) {
      console.error("recordDonation failed", err);
      toast.error("Couldn't record your donation — check your connection and try again.");
    } finally {
      setDonating(false);
      setDonateConfirm(false);
    }
  }

  async function handleTransfer(toId: string) {
    setTransferring(true);
    try {
      await transferJarBalance(uid, jarId, toId);
      onResolved({ [jarId]: 0 });
      setResolved(true);
    } catch (err) {
      console.error("transferJarBalance failed", err);
      toast.error("Couldn't transfer your jar — check your connection and try again.");
    } finally {
      setTransferring(false);
      setShowTransferPicker(false);
    }
  }

  if (resolved) return null;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}>
      {project?.imageURL && (
        <div className="h-20 w-full overflow-hidden">
          <img src={project.imageURL} alt="" className="w-full h-full object-cover" style={{ objectPosition: project.imagePosition ?? "center" }} />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="text-base font-black leading-tight" style={{ color: "var(--text-primary)" }}>{title}</p>
            {project?.sponsor && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{project.sponsor}</p>
            )}
            {countdown?.isExpired && (
              <p className="text-xs mt-0.5 font-semibold" style={{ color: "#EF4444" }}>{countdown.label}</p>
            )}
            {!countdown?.isExpired && countdown?.daysLeft !== null && countdown?.label && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{countdown.label}</p>
            )}
          </div>
          <p className="text-2xl font-black shrink-0" style={{ color: "var(--green-primary)" }}>
            {formatCurrency(balance)}
          </p>
        </div>

        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          {isChallenge
            ? "This challenge ended. Your savings are ready to donate."
            : "You saved money toward this cause. What would you like to do with it?"}
        </p>

        {!donateConfirm && !showTransferPicker && (
          <div className="flex flex-col gap-2">
            {donationURL ? (
              <button
                onClick={handleDonate}
                className="w-full py-3 rounded-xl text-sm font-black"
                style={{ background: "linear-gradient(135deg, var(--green-primary), #1E9485)", color: "white" }}
              >
                Donate {formatCurrency(balance)} Now
              </button>
            ) : (
              <button
                onClick={() => setDonateConfirm(true)}
                className="w-full py-3 rounded-xl text-sm font-black"
                style={{ background: "linear-gradient(135deg, var(--green-primary), #1E9485)", color: "white" }}
              >
                Mark as Donated
              </button>
            )}
            {transferTargets.length > 0 && (
              <button
                onClick={() => setShowTransferPicker(true)}
                className="w-full py-2.5 rounded-xl text-sm font-bold"
                style={{ border: "1px solid var(--border-emphasis)", color: "var(--green-primary)" }}
              >
                Transfer to Another Jar
              </button>
            )}
          </div>
        )}

        {donateConfirm && (
          <div className="space-y-2">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Did you donate {formatCurrency(balance)} to {title}?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDonateConfirm(false)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                Not yet
              </button>
              <button
                onClick={handleMarkDonated}
                disabled={donating}
                className="flex-1 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                style={{ background: "var(--green-primary)", color: "white" }}
              >
                {donating ? "Saving..." : "Yes, I donated!"}
              </button>
            </div>
          </div>
        )}

        {showTransferPicker && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Transfer to:</p>
            {transferTargets.map((target) => (
              <button
                key={target.id}
                onClick={() => handleTransfer(target.id)}
                disabled={transferring}
                className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left disabled:opacity-50"
                style={{ background: "var(--bg-surface-3)", border: "1px solid var(--border-default)" }}
              >
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{target.title}</p>
                  {target.sponsor && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{target.sponsor}</p>}
                </div>
                <span className="text-sm font-black" style={{ color: "var(--green-primary)" }}>→</span>
              </button>
            ))}
            <button
              onClick={() => setShowTransferPicker(false)}
              className="w-full py-2 rounded-xl text-xs font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
