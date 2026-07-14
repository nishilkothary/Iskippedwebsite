"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { OFFICIAL_PROJECTS, PARTNER_CHALLENGE_IDS } from "@/lib/services/firebase/projects";
import { switchCause, updateJarSettings, completeOnboarding } from "@/lib/services/firebase/users";
import { SkipModal } from "@/components/skip/SkipModal";

const PICKABLE_CAUSES = OFFICIAL_PROJECTS.filter((p) => PARTNER_CHALLENGE_IDS.includes(p.id));

type Step = 1 | 2 | 3 | "skip-modal" | "celebrate";

interface Props {
  onDone: () => void;
}

const cardStyle: React.CSSProperties = {
  background: "var(--bg-surface-1)",
  border: "1px solid var(--border-default)",
};

export function OnboardingFlow({ onDone }: Props) {
  const { user, profile, updateProfile } = useAuthStore();
  const { projects } = useProjects();
  const [step, setStep] = useState<Step>(1);
  const [selectedCauseId, setSelectedCauseId] = useState<string | null>(null);
  const [overrideCausePicker, setOverrideCausePicker] = useState(false);
  const [splitGive, setSplitGive] = useState(50);
  const [saving, setSaving] = useState(false);

  if (!user || !profile) return null;

  // The user may already have an active cause — e.g. they joined a challenge (official or
  // community-created) via a referral link before onboarding ever got a chance to run.
  // Honor that instead of prompting them to pick again.
  const preselectedProject = profile.activeProjectId
    ? projects.find((p) => p.id === profile.activeProjectId) ?? null
    : null;
  const showCauseGrid = !preselectedProject || overrideCausePicker;

  async function finish() {
    setSaving(true);
    try {
      await completeOnboarding(user!.uid);
    } catch {
      toast.error("Couldn't save your onboarding progress, but you're all set to start skipping.");
    } finally {
      setSaving(false);
      onDone();
    }
  }

  async function handleContinueStep1() {
    if (showCauseGrid && selectedCauseId) {
      setSaving(true);
      try {
        await switchCause(user!.uid, profile!.activeProjectId, selectedCauseId);
        updateProfile({
          activeProjectId: selectedCauseId,
          joinedProjectIds: [...(profile!.joinedProjectIds ?? []), selectedCauseId],
        });
      } catch {
        toast.error("Couldn't save your cause — you can pick one anytime from Jars.");
      } finally {
        setSaving(false);
      }
    }
    setStep(2);
  }

  async function handleContinueStep2() {
    const split = { give: splitGive, live: 100 - splitGive };
    setSaving(true);
    try {
      await updateJarSettings(user!.uid, split, null);
      updateProfile({ jarSplit: split });
    } catch {
      toast.error("Couldn't save your split — you can adjust it anytime from Jars.");
    } finally {
      setSaving(false);
    }
    setStep(3);
  }

  if (step === "skip-modal") {
    return <SkipModal onClose={() => setStep("celebrate")} />;
  }

  if (step === "celebrate") {
    return (
      <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
        <div className="rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl" style={cardStyle}>
          <div className="text-6xl mb-3">🎉</div>
          <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            You&apos;re all set, {profile.displayName.split(" ")[0]}!
          </p>
          <p className="text-sm mt-3" style={{ color: "var(--text-secondary)" }}>
            Every skip adds up — for the causes you care about, and for you.
          </p>
          <button
            onClick={finish}
            disabled={saving}
            className="mt-6 w-full font-bold py-3 rounded-xl text-sm disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
              color: "var(--bg-base)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {saving ? "Finishing…" : "Let's go →"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" style={cardStyle}>
        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 pt-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="flex-1 h-1.5 rounded-full"
              style={{ background: n <= step ? "var(--green-primary)" : "var(--bg-surface-3)" }}
            />
          ))}
        </div>

        {step === 1 && !showCauseGrid && preselectedProject && (
          <div className="px-6 py-5">
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>You&apos;re already in!</h2>
            <p className="text-sm mt-1 mb-4" style={{ color: "var(--text-muted)" }}>
              Your giving jar is set up for the cause you joined.
            </p>
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface-2)" }}>
              {preselectedProject.imageURL ? (
                <img src={preselectedProject.imageURL} alt={preselectedProject.title} className="w-full h-28 object-cover" />
              ) : (
                <div className="w-full h-28 flex items-center justify-center text-4xl" style={{ background: "var(--bg-surface-3)" }}>
                  🌍
                </div>
              )}
              <div className="p-3">
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{preselectedProject.title}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{preselectedProject.sponsor}</p>
              </div>
            </div>
            <button
              onClick={() => setOverrideCausePicker(true)}
              className="mt-3 text-xs font-medium underline"
              style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
            >
              Choose a different cause instead
            </button>
          </div>
        )}

        {step === 1 && showCauseGrid && (
          <div className="px-6 py-5">
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Pick a cause</h2>
            <p className="text-sm mt-1 mb-4" style={{ color: "var(--text-muted)" }}>
              Choose where your giving jar goes. You can change this anytime.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {PICKABLE_CAUSES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedCauseId(p.id)}
                  className="rounded-xl overflow-hidden text-left transition-all"
                  style={{
                    border: selectedCauseId === p.id ? "2px solid var(--green-primary)" : "1px solid var(--border-default)",
                    background: "var(--bg-surface-2)",
                  }}
                >
                  {p.imageURL ? (
                    <img src={p.imageURL} alt={p.title} className="w-full h-20 object-cover" />
                  ) : (
                    <div className="w-full h-20 flex items-center justify-center text-3xl" style={{ background: "var(--bg-surface-3)" }}>
                      🌍
                    </div>
                  )}
                  <div className="p-2.5">
                    <p className="text-xs font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{p.title}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{p.sponsor}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="px-6 py-5">
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Set your split</h2>
            <p className="text-sm mt-1 mb-4" style={{ color: "var(--text-muted)" }}>
              Every skip gets divided between your giving jar and your reward jar. Start at 50/50 — you can adjust it per skip later.
            </p>
            <div className="flex justify-between mb-2">
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--green-primary)" }}>🤲 Giving Jar</p>
                <p className="text-xl font-black" style={{ color: "var(--green-primary)" }}>{splitGive}%</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold" style={{ color: "#8B5CF6" }}>😊 Reward Jar</p>
                <p className="text-xl font-black" style={{ color: "#8B5CF6" }}>{100 - splitGive}%</p>
              </div>
            </div>
            <div className="relative h-2 rounded-full mb-4 overflow-hidden" style={{ background: "var(--bg-surface-3)" }}>
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${splitGive}%`, background: "linear-gradient(90deg, var(--green-primary), #2ECC71)" }} />
              <div className="absolute inset-y-0 right-0 rounded-full" style={{ width: `${100 - splitGive}%`, background: "linear-gradient(90deg, #7C3AED, #8B5CF6)" }} />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={splitGive}
              onChange={(e) => setSplitGive(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: "var(--green-primary)", height: 4 }}
            />
          </div>
        )}

        {step === 3 && (
          <div className="px-6 py-5 text-center">
            <div className="text-5xl mb-3">✨</div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Log your first skip</h2>
            <p className="text-sm mt-1 mb-5" style={{ color: "var(--text-muted)" }}>
              Skipped a coffee, a takeout order, an impulse buy? Log it and watch your jars fill up.
            </p>
            <button
              onClick={() => setStep("skip-modal")}
              className="w-full font-bold py-3 rounded-xl text-sm"
              style={{
                background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                color: "var(--bg-base)",
                border: "none",
                cursor: "pointer",
              }}
            >
              Log my first skip
            </button>
          </div>
        )}

        {/* Footer nav */}
        <div className="px-6 pb-6 pt-2 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              if (step === 1) setStep(2);
              else if (step === 2) setStep(3);
              else finish();
            }}
            disabled={saving}
            className="text-sm font-medium disabled:opacity-60"
            style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
          >
            I&apos;ll do this later
          </button>
          {step !== 3 && (
            <button
              onClick={step === 1 ? handleContinueStep1 : handleContinueStep2}
              disabled={saving}
              className="font-bold py-2.5 px-6 rounded-xl text-sm disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
                color: "var(--bg-base)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {saving ? "Saving…" : "Continue →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
