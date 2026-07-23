"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useAuthStore } from "@/store/authStore";
import { SKIP_CATEGORIES } from "@/lib/constants/skipCategories";
import { formatCurrency } from "@/lib/utils/currency";
import { normalizeJarSplit, normalizeSpendingGoals } from "@/lib/services/firebase/users";
import { formatUnits, oneUnitPhrase } from "@/lib/utils/impact";
import { isChallengeProject } from "@/lib/services/firebase/projects";
import { getChallengeCountdown } from "@/lib/utils/dates";
import { appendRefParam } from "@/lib/utils/share";
import { ShareButton } from "@/components/share/ShareButton";
import { isPushSupported, registerForPush } from "@/lib/services/firebase/push";
import { subscribeToGlobalStats } from "@/lib/services/firebase/social";
import type { GlobalStats } from "@/lib/types/models";
import { useCountUp } from "@/hooks/useCountUp";
import { impactScore, pointsForDollars } from "@/lib/utils/impactScore";

interface Props {
  onClose: () => void;
}

export function SkipModal({ onClose }: Props) {
  const router = useRouter();
  const { log, isLogging } = useSkips();
  const { projects } = useProjects();
  const { profile, updateProfile } = useAuthStore();

  const profileSplit = normalizeJarSplit(profile?.jarSplit as any);

  const defaultCat = SKIP_CATEGORIES[0];
  const [selectedCat, setSelectedCat] = useState(defaultCat);
  const [amount, setAmount] = useState(0);
  const [amountStr, setAmountStr] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [whatSkipped, setWhatSkipped] = useState("");
  const [shareWithCommunity, setShareWithCommunity] = useState(false);
  const shareToggleTouchedRef = useRef(false);
  const [projectId] = useState<string | null>(profile?.activeProjectId ?? null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [successProjectTitle, setSuccessProjectTitle] = useState<string | null>(null);
  const [successProjectLocation, setSuccessProjectLocation] = useState<string | null>(null);
  const [successProjectUnitName, setSuccessProjectUnitName] = useState<string | null>(null);
  const [successProjectUnitCost, setSuccessProjectUnitCost] = useState<number | null>(null);
  const [skipGivePct, setSkipGivePct] = useState(profileSplit.give);
  const [successOverflowCount, setSuccessOverflowCount] = useState<number | undefined>(undefined);
  const [successJarBalance, setSuccessJarBalance] = useState(0);
  const [pushSupported, setPushSupported] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [pushPromptBusy, setPushPromptBusy] = useState(false);
  const [successStreak, setSuccessStreak] = useState(0);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const dialogRef = useModalA11y(onClose);
  const activeProjectForSkip = projects.find((p) => p.id === projectId) ?? null;
  const isActiveChallenge = activeProjectForSkip ? isChallengeProject(activeProjectForSkip) : false;
  // If the active project has expired, don't credit this skip to its jar
  const effectiveProjectId = activeProjectForSkip && getChallengeCountdown(activeProjectForSkip).isExpired
    ? null
    : projectId;

  useEffect(() => {
    if (isActiveChallenge && !shareToggleTouchedRef.current) {
      setShareWithCommunity(true);
    }
  }, [isActiveChallenge]);

  useEffect(() => {
    isPushSupported().then(setPushSupported);
  }, []);

  // Live community momentum for the share card ("$X saved across N skips").
  useEffect(() => subscribeToGlobalStats(setGlobalStats), []);

  function handleCatSelect(cat: typeof defaultCat) {
    setSelectedCat(cat);
    setCustomLabel("");
  }

  async function handleSubmit() {
    const selectedProject = projects.find((p) => p.id === projectId);

    // Pre-compute jar-full state synchronously using same formula as jars page
    const personalGoal = profile?.causeGoalAmounts?.[projectId ?? ""] ?? selectedProject?.goalAmount ?? 0;
    // Mirror jars page: globalGivingBalance = totalGiveAllocated - totalDonated
    const giveTotal = profile?.totalGiveAllocated ?? (profile?.totalSaved ?? 0) * (profileSplit.give / 100);
    const currentJarBal = Math.max(0, giveTotal - (profile?.totalDonated ?? 0));
    const giveAmt = amount * (skipGivePct / 100);
    const expectedJarBal = currentJarBal + giveAmt;
    const willBeFull = projectId != null && personalGoal > 0 && giveAmt > 0
      && expectedJarBal >= personalGoal;
    const nextOverflowCount = willBeFull
      ? (profile?.causeJarOverflowCounts?.[projectId ?? ""] ?? 0) + 1
      : 0;

    const result = await log({
      category: selectedCat.id,
      categoryLabel: customLabel || selectedCat.label,
      categoryEmoji: selectedCat.emoji,
      amount,
      projectId: effectiveProjectId,
      projectTitle: selectedProject?.title ?? null,
      projectLocation: selectedProject?.location ?? null,
      projectUnitName: selectedProject?.unitName ?? null,
      projectUnitCost: selectedProject?.unitCost ?? null,
      projectUnitDisplay: selectedProject?.unitDisplay ?? null,
      projectUnitIsGoal: selectedProject?.unitIsGoal ?? null,
      shareWithCommunity,
      whatSkipped: whatSkipped || undefined,
      jarSplit: { give: skipGivePct, live: 100 - skipGivePct },
      causeGoalAmount: personalGoal,
    });
    if (result) {
      setSuccessStreak(result.newStreak ?? profile?.streak ?? 0);
      setSuccessProjectTitle(selectedProject?.title ?? null);
      setSuccessProjectLocation(selectedProject?.location ?? null);
      setSuccessProjectUnitName(selectedProject?.unitName ?? null);
      setSuccessProjectUnitCost(selectedProject?.unitCost ?? null);
      if (willBeFull) {
        setSuccessOverflowCount(nextOverflowCount);
        setSuccessJarBalance(expectedJarBal);
      }
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([12, 28, 18]);
      }
      setSuccess(true);
    }
  }

  if (success) {
    const skipGive = amount * (skipGivePct / 100);
    const successActiveProject = projects.find((p) => p.id === profile?.activeProjectId) ?? null;
    const postLogSkipCount = (profile?.totalSkips ?? 0) + 1;
    const isFirstSkip = postLogSkipCount === 1;

    // Neutral dismiss (×, backdrop, "Maybe later") — on a first-ever skip, offer to turn on
    // reminders before actually closing. Deliberate CTA navigations (Donate Now, Pick a cause)
    // bypass this and close straight through.
    function dismissSuccess() {
      if (isFirstSkip && pushSupported && !profile?.pushOptIn) {
        setShowPushPrompt(true);
        return;
      }
      onClose();
    }

    if (showPushPrompt) {
      return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="skip-push-title"
            tabIndex={-1}
            className="rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl relative"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
            <div className="text-6xl mb-3">🔥</div>
            <p id="skip-push-title" className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>You&apos;re starting to make a difference</p>
            <p className="text-sm mt-3" style={{ color: "var(--text-secondary)" }}>
              Keep growing your savings and continue to make a difference in the world by turning on iSkipped reminders.
            </p>
            <button
              onClick={async () => {
                setPushPromptBusy(true);
                try {
                  await registerForPush();
                  updateProfile({ pushOptIn: true });
                  toast.success("Reminders are on — let's keep this going!");
                } catch (e: any) {
                  toast.error(e?.message || "Couldn't turn on reminders.");
                } finally {
                  setPushPromptBusy(false);
                  onClose();
                }
              }}
              disabled={pushPromptBusy}
              className="mt-5 w-full font-bold py-3 rounded-xl text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: "#2ECC71", color: "#0B1A14", border: "none", cursor: "pointer", fontSize: 15 }}
            >
              {pushPromptBusy ? "Turning on…" : "🔔 Turn on reminders"}
            </button>
            <button
              onClick={onClose}
              className="mt-2 w-full py-2 text-sm"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            >
              Not now
            </button>
          </div>
        </div>
      );
    }

    // Goal progress for "x% towards your reward" line
    const { goals: successSpendingGoals, activeId: successActiveGoalId } = normalizeSpendingGoals(profile ?? {} as any);
    const successActiveGoal = successSpendingGoals.find(g => g.id === successActiveGoalId) ?? null;
    const liveAmt = amount - skipGive; // live portion of this skip
    const goalPctDisplay: string | null = (() => {
      if (!successActiveGoal || successActiveGoal.targetAmount <= 0) return null;
      const raw = Math.min(100, (liveAmt / successActiveGoal.targetAmount) * 100);
      if (raw < 1) return raw < 0.1 ? "0.1" : raw.toFixed(1);
      return String(Math.round(raw));
    })();

    // Build impact display string (for modal) and share impact clause
    const itemLabel = whatSkipped || customLabel || selectedCat.label.toLowerCase();
    const causeTitle = successProjectTitle ?? null;
    let impactDisplay = "";
    let impactClause = "";
    const hasCauseImpact = !!successActiveProject && !!causeTitle;
    if (successActiveProject?.isCustom) {
      const pct = (successActiveProject.goalAmount ?? 0) > 0
        ? Math.max(1, Math.round((skipGive / successActiveProject.goalAmount!) * 100))
        : 0;
      impactDisplay = `${pct}% Towards Goal`;
      impactClause = ` to help save towards my cause`;
    } else if (causeTitle && successProjectUnitName && successProjectUnitCost && !successActiveProject?.unitIsGoal) {
      const unitsStr = formatUnits(skipGive, successProjectUnitCost, successProjectUnitName);
      const locationSuffix = successProjectLocation ? ` in ${successProjectLocation}` : "";
      impactDisplay = `${unitsStr}${locationSuffix}`;
      impactClause = ` to help pledge ${unitsStr}${locationSuffix}`;
    } else if (causeTitle && successProjectUnitName && successProjectUnitCost && successActiveProject?.unitIsGoal) {
      const pct = Math.max(1, Math.round((skipGive / successProjectUnitCost) * 100));
      // One unit IS the goal here, so phrase it in the singular: "88% of a Chromebook for a student"
      const unitPhrase = successActiveProject.unitPhrase ?? oneUnitPhrase(successProjectUnitName);
      impactDisplay = `${pct}% of ${unitPhrase}`;
      impactClause = ` to help pledge ${pct}% of ${unitPhrase}`;
    } else if (causeTitle) {
      impactDisplay = causeTitle;
      impactClause = ` to help pledge toward ${causeTitle}`;
    } else {
      impactDisplay = `${formatCurrency(amount)} saved`;
    }
    const challengeURL = successActiveProject
      ? appendRefParam(`${typeof window !== "undefined" ? window.location.origin : "https://iskipped.com"}/join/${successActiveProject.id}`, profile?.uid)
      : "https://iskipped.com";
    const shareText = successActiveProject
      ? `I skipped ${itemLabel}${impactClause}. Join the challenge and skip an expense for a good cause: ${challengeURL}`
      : `I skipped ${itemLabel}${impactClause}. Join the movement at https://iskipped.com`;
    // Same as shareText but without the trailing URL — WhatsApp/X intents append/attach the url themselves.
    const shareIntentText = successActiveProject
      ? `I skipped ${itemLabel}${impactClause}. Join the challenge and skip an expense for a good cause!`
      : `I skipped ${itemLabel}${impactClause}. Join the movement!`;

    // Show jar-full celebration when give jar hits/exceeds goal (first time, then every 3rd skip)
    const overflowCount = successOverflowCount ?? 0;
    const showJarFull = successActiveProject != null && overflowCount >= 1 && (overflowCount === 1 || (overflowCount - 1) % 3 === 0);

    if (showJarFull && successActiveProject) {
      return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={dismissSuccess}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="skip-jarfull-title"
            tabIndex={-1}
            className="rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl relative"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={dismissSuccess} aria-label="Close" className="absolute top-4 right-4 text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
            <div className="text-6xl mb-3">🫙</div>
            <p id="skip-jarfull-title" className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Giving Jar Full!</p>
            <p className="font-bold text-lg mt-1" style={{ color: "#2ECC71" }}>Congratulations!</p>
            <p className="text-sm mt-3" style={{ color: "var(--text-secondary)" }}>
              You&apos;ve pledged 100% of your <strong style={{ color: "var(--text-primary)" }}>{successActiveProject.title}</strong>{" "}giving jar.
              It&apos;s time to empty your jar and send it over!
            </p>
            <p className="text-sm mt-2 font-semibold" style={{ color: "#2ECC71" }}>
              {formatCurrency(successJarBalance)} ready to donate
            </p>
            <button
              onClick={() => { onClose(); router.push("/jars?tab=cause"); }}
              className="mt-5 w-full font-bold py-3 rounded-xl text-sm"
              style={{ background: "#2ECC71", color: "#0B1A14", border: "none", cursor: "pointer", fontSize: 15 }}
            >
              Donate Now →
            </button>
            <button
              onClick={dismissSuccess}
              className="mt-2 w-full py-2 text-sm"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            >
              Maybe later
            </button>
          </div>
        </div>
      );
    }

    // Show cause nudge INSTEAD of great job on skip #1 and every 3rd skip (until cause is chosen)
    const showCauseNudge = !successActiveProject && (postLogSkipCount === 1 || postLogSkipCount % 3 === 1);

    if (showCauseNudge) {
      const nudgeCfc = projects.find((p) => p.id === "cfc");
      const nudgePalestine = projects.find((p) => p.id === "stm-palestine");
      const nudgeUkraine = projects.find((p) => p.id === "stm-ukraine");
      return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={dismissSuccess}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="skip-nudge-title"
            tabIndex={-1}
            className="rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl relative"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={dismissSuccess} aria-label="Close" className="absolute top-4 right-4 text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
            <div className="text-6xl mb-3">🌍</div>
            <p id="skip-nudge-title" className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Your skips can change lives</p>
            <p className="font-bold text-lg mt-1" style={{ color: "var(--green-primary)" }}>{formatCurrency(amount)} saved</p>
            <p className="text-sm mt-3" style={{ color: "var(--text-secondary)" }}>
              You could pledge {formatCurrency(skipGive)} from this skip toward:
            </p>
            <ul className="text-left mt-2 space-y-1" style={{ color: "var(--text-secondary)", fontSize: 13, paddingLeft: 20 }}>
              {nudgeCfc?.unitCost && <li>{formatUnits(skipGive, nudgeCfc.unitCost, nudgeCfc.unitName!)} in {nudgeCfc.location}</li>}
              {nudgePalestine?.unitCost && <li>{formatUnits(skipGive, nudgePalestine.unitCost, nudgePalestine.unitName!)} in Palestine</li>}
              {nudgeUkraine?.unitCost && <li>{formatUnits(skipGive, nudgeUkraine.unitCost, nudgeUkraine.unitName!)} in Ukraine</li>}
            </ul>
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>...amongst many other things.</p>
            <button
              onClick={() => { onClose(); router.push("/jars?tab=cause"); }}
              className="mt-5 w-full font-bold py-3 rounded-xl text-sm"
              style={{ background: "#2BBAA4", color: "#fff", border: "none", cursor: "pointer", fontSize: 15 }}
            >
              Pick a cause →
            </button>
            <button
              onClick={dismissSuccess}
              className="mt-2 w-full py-2 text-sm"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            >
              Maybe later
            </button>
          </div>
        </div>
      );
    }

    const causeImageURL = successActiveProject?.imageURL ?? null;
    const newImpactScore = impactScore(profile);
    const scoreDelta = pointsForDollars(skipGive);
    const showStreak = successStreak >= 1;
    const chipCount = showStreak ? 3 : 2;
    const momentumSkips = globalStats?.totalSkips ?? 0;
    const momentumSaved = globalStats?.totalSaved ?? 0;
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={dismissSuccess}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="skip-success-title"
          tabIndex={-1}
          className="iskip-pop-in rounded-2xl overflow-hidden text-center max-w-sm w-full shadow-2xl relative"
          style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
          onClick={(e) => e.stopPropagation()}
        >
          {causeImageURL ? (
            <div className="relative">
              <img src={causeImageURL} className="w-full h-32 object-cover" alt={successProjectTitle ?? ""} />
              <button onClick={dismissSuccess} aria-label="Close" className="absolute top-3 right-3 text-xl leading-none w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "rgba(0,0,0,0.4)", color: "#fff" }}>×</button>
            </div>
          ) : (
            <button onClick={dismissSuccess} aria-label="Close" className="absolute top-4 right-4 text-2xl leading-none z-10" style={{ color: "var(--text-muted)" }}>×</button>
          )}
          <div className="px-6 pb-6" style={{ paddingTop: causeImageURL ? 14 : 0 }}>
            {/* Beat 1 — Celebrate */}
            {!causeImageURL && (
              <div className="relative inline-block mt-2 mb-1">
                <EmojiBurst />
                <div className="text-6xl">🎉</div>
              </div>
            )}
            {hasCauseImpact && (
              <p className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Thank you for pledging</p>
            )}
            <p id="skip-success-title" className="text-2xl font-bold leading-tight" style={{ color: "var(--green-primary)" }}>{impactDisplay}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>from this skip</p>
            {hasCauseImpact && goalPctDisplay !== null && successActiveGoal && (
              <p className="text-sm mt-2 font-semibold" style={{ color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--gold-cta)" }}>{goalPctDisplay}%</span> closer to your{" "}
                <span style={{ color: "var(--gold-cta)" }}>{successActiveGoal.label}</span> reward!
              </p>
            )}

            {/* Beat 2 — Reward chips */}
            <div className="mt-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${chipCount}, minmax(0, 1fr))` }}>
              <div className="iskip-chip rounded-xl py-2.5 px-2" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)", animationDelay: "40ms" }}>
                <p className="text-base font-black leading-none" style={{ color: "var(--text-primary)" }}>
                  <CountUp value={amount} render={(n) => formatCurrency(n)} />
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wide mt-1" style={{ color: "var(--text-muted)" }}>saved</p>
              </div>
              {showStreak && (
                <div className="iskip-chip rounded-xl py-2.5 px-2" style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.25)", animationDelay: "120ms" }}>
                  <p className="text-base font-black leading-none" style={{ color: "#F97316" }}>🔥 {successStreak}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide mt-1" style={{ color: "var(--text-muted)" }}>day streak</p>
                </div>
              )}
              <div className="iskip-chip rounded-xl py-2.5 px-2 relative" style={{ background: "rgba(46,204,113,0.1)", border: "1px solid var(--border-emphasis)", animationDelay: "200ms" }}>
                <p className="text-base font-black leading-none" style={{ color: "var(--green-primary)" }}>
                  ⚡ <CountUp value={newImpactScore} from={Math.max(0, newImpactScore - scoreDelta)} render={(n) => Math.round(n).toLocaleString()} />
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wide mt-1" style={{ color: "var(--text-muted)" }}>
                  impact {scoreDelta > 0 ? <span style={{ color: "var(--green-primary)" }}>+{scoreDelta}</span> : "score"}
                </p>
              </div>
            </div>

            {/* Beat 3 — Spread */}
            <div className="mt-5 rounded-2xl p-4 text-left" style={{ background: "linear-gradient(160deg, rgba(46,204,113,0.12), rgba(46,204,113,0.03))", border: "1px solid var(--border-emphasis)" }}>
              <p className="text-sm font-black" style={{ color: "var(--text-primary)" }}>🚀 Make your skip contagious</p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {successActiveProject
                  ? "Every dollar a friend pledges adds to your Impact Score — and funds the cause faster."
                  : "Bring a friend along — every dollar they pledge adds to your Impact Score too."}
              </p>
              <div className="mt-3 iskip-pulse">
                <ShareButton
                  variant="block"
                  tone="primary"
                  label="Share the challenge"
                  url={challengeURL}
                  text={shareIntentText}
                  title={successActiveProject?.title ?? "iSkipped"}
                />
              </div>
              {momentumSkips > 0 && (
                <p className="text-[11px] mt-2.5 text-center font-semibold" style={{ color: "var(--text-muted)" }}>
                  {formatCurrency(momentumSaved)} saved across {momentumSkips.toLocaleString()} skips
                </p>
              )}
            </div>

            {/* De-emphasized footer */}
            <div className="mt-3 flex items-center justify-center text-xs font-semibold">
              <button onClick={dismissSuccess} style={{ color: "var(--text-muted)" }}>Done</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const skipGiveLive = amount * (skipGivePct / 100);
  const skipLiveLive = amount * ((100 - skipGivePct) / 100);
  const activeProjectLive = projects.find((p) => p.id === profile?.activeProjectId) ?? null;
  const { goals: spendingGoals, activeId: activeSpendingGoalId } = normalizeSpendingGoals(profile ?? {} as any);
  const activeGoalLive = spendingGoals.find((g) => g.id === activeSpendingGoalId) ?? null;
  const spendingGoalLabelLive = activeGoalLive?.label ?? "Reward Jar";
  const giveGoalAmount = activeProjectLive?.goalAmount ?? 0;
  const giveContribPctLive = giveGoalAmount > 0 ? (skipGiveLive / giveGoalAmount) * 100 : 0;
  const liveGoalAmount = activeGoalLive?.targetAmount ?? 0;
  const liveContribPctLive = liveGoalAmount > 0 ? (skipLiveLive / liveGoalAmount) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="skip-form-title"
        tabIndex={-1}
        className="rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", outline: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <h2 id="skip-form-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Log a Skip</h2>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* What did you skip */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>What did you skip?</label>
            <input
              type="text"
              value={whatSkipped}
              onChange={(e) => setWhatSkipped(e.target.value)}
              placeholder={`e.g. "morning latte at Starbucks"`}
              maxLength={100}
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
              style={{
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Amount skipped</label>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold" style={{ color: "var(--green-primary)" }}>$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) {
                    setAmountStr(raw);
                    const v = parseFloat(raw);
                    if (!isNaN(v) && v > 0) setAmount(v);
                  }
                }}
                onBlur={() => {
                  if (!amountStr || parseFloat(amountStr) <= 0) {
                    setAmount(0.01);
                    setAmountStr("0.01");
                  }
                }}
                className="w-28 text-2xl font-bold border-b-2 focus:outline-none bg-transparent"
                style={{ color: "var(--green-primary)", borderColor: "var(--green-primary)" }}
              />
            </div>
          </div>

          {/* Per-skip split slider */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>This skip&apos;s split</label>
            <div className="flex items-center justify-between text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              <span>🤲 Giving <span className="font-bold" style={{ color: "var(--coral-primary)" }}>{skipGivePct}%</span></span>
              <span>💰 Reward <span className="font-bold" style={{ color: "#2BBAA4" }}>{100 - skipGivePct}%</span></span>
            </div>
            <div className="relative">
              <input
                type="range"
                min={0}
                max={100}
                value={skipGivePct}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  const snapped = Math.abs(raw - profileSplit.give) <= 3 ? profileSplit.give : raw;
                  setSkipGivePct(snapped);
                }}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #E8637A ${skipGivePct}%, #2BBAA4 ${skipGivePct}%)`,
                }}
              />
              <div
                className="absolute top-0 h-full w-0.5 pointer-events-none"
                style={{
                  left: `${profileSplit.give}%`,
                  background: "rgba(255,255,255,0.55)",
                  transform: "translateX(-50%)",
                }}
              />
            </div>
            <div className="flex justify-between mt-0.5" style={{ fontSize: 10, color: "var(--text-muted)" }}>
              <span>All Giving</span>
              <span>All Reward</span>
            </div>
          </div>

          {/* This Skip's Impact */}
          {amount > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>This Skip&apos;s Impact</p>
              <div className="space-y-1">
                <p className="text-sm font-semibold" style={{ color: "var(--coral-primary)" }}>
                  🤲 {(() => {
                    if (activeProjectLive?.unitCost && !activeProjectLive.unitIsGoal) {
                      const units = formatUnits(skipGiveLive, activeProjectLive.unitCost, activeProjectLive.unitName!);
                      return activeProjectLive.location ? `${units} in ${activeProjectLive.location}` : units;
                    } else if (activeProjectLive?.unitCost && activeProjectLive.unitIsGoal) {
                      const pct = Math.max(1, Math.round((skipGiveLive / activeProjectLive.unitCost) * 100));
                      const unitPhrase = activeProjectLive.unitPhrase
                        ?? (activeProjectLive.unitName ? oneUnitPhrase(activeProjectLive.unitName) : "a unit");
                      return `${pct}% of ${unitPhrase} funded`;
                    } else if (activeProjectLive && giveGoalAmount > 0) {
                      return `${giveContribPctLive.toFixed(1)}% toward ${activeProjectLive.title}`;
                    } else if (activeProjectLive) {
                      return `${formatCurrency(skipGiveLive)} toward ${activeProjectLive.title}`;
                    } else {
                      return formatCurrency(skipGiveLive);
                    }
                  })()}
                </p>
                <p className="text-sm font-semibold" style={{ color: "#2BBAA4" }}>
                  😊 {liveGoalAmount > 0 ? `${liveContribPctLive.toFixed(1)}% toward ${spendingGoalLabelLive}` : formatCurrency(skipLiveLive)}
                </p>
              </div>
            </div>
          )}

          {/* Categories */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Category</label>
            <div className="grid grid-cols-4 gap-2">
              {SKIP_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCatSelect(cat)}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl text-sm transition-all"
                  style={
                    selectedCat.id === cat.id
                      ? {
                          border: "1px solid var(--green-primary)",
                          background: "var(--bg-surface-2)",
                          color: "var(--green-primary)",
                        }
                      : {
                          border: "1px solid var(--border-default)",
                          background: "transparent",
                          color: "var(--text-secondary)",
                        }
                  }
                >
                  <span className="text-xl">{cat.emoji}</span>
                  <span className="text-xs font-medium">{cat.label}</span>
                </button>
              ))}
            </div>
            {selectedCat.id === "custom" && (
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Enter category"
                maxLength={50}
                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none mt-2"
                style={{
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                }}
              />
            )}
          </div>

          {/* Share toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => {
                shareToggleTouchedRef.current = true;
                setShareWithCommunity((v) => !v);
              }}
              className="w-11 h-6 rounded-full transition-colors relative"
              style={{ background: shareWithCommunity ? "var(--green-primary)" : "var(--bg-surface-3)" }}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${shareWithCommunity ? "translate-x-5" : ""}`}
              />
            </div>
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>Share my skip with the community (It motivates others)!</span>
          </label>
        </div>

        {/* Submit */}
        <div className="px-6 pb-6">
          <button
            onClick={handleSubmit}
            disabled={isLogging || amount <= 0}
            className="w-full font-bold py-4 rounded-xl text-base transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
              color: "var(--bg-base)",
              boxShadow: amount > 0 ? "0 4px 18px var(--gold-glow)" : "none",
            }}
          >
            {isLogging ? "Saving…" : amount > 0 ? `Skip ${formatCurrency(amount)}` : "Enter an amount"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Animated count-up number. `render` formats the current value (e.g. currency). */
function CountUp({ value, from = 0, ms = 900, render }: { value: number; from?: number; ms?: number; render?: (n: number) => string }) {
  const n = useCountUp(value, ms, from);
  return <>{render ? render(n) : Math.round(n).toLocaleString()}</>;
}

/** CSS emoji burst behind the celebration emoji. Hidden under prefers-reduced-motion. */
function EmojiBurst() {
  const pieces = [
    { e: "✨", bx: -70, by: -42, d: 0 },
    { e: "💚", bx: 62, by: -54, d: 40 },
    { e: "🎉", bx: -52, by: 30, d: 20 },
    { e: "⭐", bx: 76, by: 18, d: 60 },
    { e: "💫", bx: 2, by: -76, d: 10 },
    { e: "🌟", bx: -82, by: -6, d: 80 },
    { e: "🙌", bx: 42, by: 46, d: 30 },
    { e: "🔥", bx: 22, by: -62, d: 50 },
  ];
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ overflow: "visible" }}>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="iskip-burst-piece"
          style={{
            ["--bx" as string]: `${p.bx}px`,
            ["--by" as string]: `${p.by}px`,
            animationDelay: `${p.d}ms`,
            fontSize: 18,
            marginLeft: -9,
            marginTop: -9,
          } as CSSProperties}
        >
          {p.e}
        </span>
      ))}
    </div>
  );
}
