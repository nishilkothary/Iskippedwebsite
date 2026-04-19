"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { useAuthStore } from "@/store/authStore";
import { SKIP_CATEGORIES } from "@/lib/constants/skipCategories";
import { formatCurrency } from "@/lib/utils/currency";
import { normalizeJarSplit, normalizeSpendingGoals } from "@/lib/services/firebase/users";
import { formatUnits } from "@/lib/utils/impact";

interface Props {
  onClose: () => void;
}

export function SkipModal({ onClose }: Props) {
  const router = useRouter();
  const { log, isLogging } = useSkips();
  const { projects } = useProjects();
  const { profile } = useAuthStore();

  const profileSplit = normalizeJarSplit(profile?.jarSplit as any);

  const defaultCat = SKIP_CATEGORIES[0];
  const [selectedCat, setSelectedCat] = useState(defaultCat);
  const [amount, setAmount] = useState(0);
  const [amountStr, setAmountStr] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [whatSkipped, setWhatSkipped] = useState("");
  const [shareWithCommunity, setShareWithCommunity] = useState(false);
  const [projectId] = useState<string | null>(profile?.activeProjectId ?? null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [successProjectTitle, setSuccessProjectTitle] = useState<string | null>(null);
  const [successProjectLocation, setSuccessProjectLocation] = useState<string | null>(null);
  const [successProjectUnitName, setSuccessProjectUnitName] = useState<string | null>(null);
  const [successProjectUnitCost, setSuccessProjectUnitCost] = useState<number | null>(null);
  const [skipGivePct, setSkipGivePct] = useState(profileSplit.give);

  function handleCatSelect(cat: typeof defaultCat) {
    setSelectedCat(cat);
    setCustomLabel("");
  }

  async function handleSubmit() {
    const selectedProject = projects.find((p) => p.id === projectId);
    const result = await log({
      category: selectedCat.id,
      categoryLabel: customLabel || selectedCat.label,
      categoryEmoji: selectedCat.emoji,
      amount,
      projectId,
      projectTitle: selectedProject?.title ?? null,
      projectLocation: selectedProject?.location ?? null,
      projectUnitName: selectedProject?.unitName ?? null,
      projectUnitCost: selectedProject?.unitCost ?? null,
      projectUnitDisplay: selectedProject?.unitDisplay ?? null,
      projectUnitIsGoal: selectedProject?.unitIsGoal ?? null,
      shareWithCommunity,
      whatSkipped: whatSkipped || undefined,
      jarSplit: { give: skipGivePct, live: 100 - skipGivePct },
    });
    if (result) {
      setSuccessProjectTitle(selectedProject?.title ?? null);
      setSuccessProjectLocation(selectedProject?.location ?? null);
      setSuccessProjectUnitName(selectedProject?.unitName ?? null);
      setSuccessProjectUnitCost(selectedProject?.unitCost ?? null);
      setSuccess(true);
    }
  }

  if (success) {
    const encouragements = [
      "That's what we're talking about! 🙌",
      "Look at you making a difference!",
      "Small skip, big impact. Keep it up!",
      "You're on fire! Every skip counts 🔥",
      "That's the spirit! Way to go!",
      "Love to see it. Keep skipping!",
    ];
    const encouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
    const skipGive = amount * (skipGivePct / 100);
    const skipLive = amount * ((100 - skipGivePct) / 100);
    const spendingGoalLabel = profile?.spendingGoal?.label ?? "Live a little";
    const successActiveProject = projects.find((p) => p.id === profile?.activeProjectId) ?? null;

    const itemLabel = whatSkipped || customLabel || selectedCat.label.toLowerCase();
    const causeTitle = successProjectTitle ?? null;
    // Build share text in new format: "I skipped X to help fund Y of Z. Join the movement at Iskipped.com"
    let impactClause = "";
    if (causeTitle && successProjectUnitName && successProjectUnitCost && !successActiveProject?.unitIsGoal) {
      const count = skipGive / successProjectUnitCost;
      const display = count >= 10 ? Math.round(count) : parseFloat(count.toFixed(1));
      const unitLabel = successActiveProject?.unitDisplay ?? successProjectUnitName.toLowerCase();
      impactClause = ` to help fund ${display} ${unitLabel} of ${causeTitle}`;
    } else if (causeTitle && successProjectUnitName && successProjectUnitCost && successActiveProject?.unitIsGoal) {
      const pct = Math.max(1, Math.round((skipGive / successProjectUnitCost) * 100));
      impactClause = ` to help fund ${pct}% of ${causeTitle}`;
    } else if (causeTitle) {
      impactClause = ` to help fund ${causeTitle}`;
    }
    const shareText = `I skipped ${itemLabel}${impactClause}. Join the movement at Iskipped.com`;

    // Show cause nudge INSTEAD of great job on skip #1 and every 3rd skip (until cause is chosen)
    const postLogSkipCount = (profile?.totalSkips ?? 0) + 1;
    const showCauseNudge = !successActiveProject && (postLogSkipCount === 1 || postLogSkipCount % 3 === 1);

    if (showCauseNudge) {
      const nudgeCfc = projects.find((p) => p.id === "cfc");
      const nudgePalestine = projects.find((p) => p.id === "stm-palestine");
      const nudgeUkraine = projects.find((p) => p.id === "stm-ukraine");
      return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
          <div
            className="rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl relative"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
            <div className="text-6xl mb-3">🌍</div>
            <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Your skips can change lives</p>
            <p className="font-bold text-lg mt-1" style={{ color: "var(--green-primary)" }}>{formatCurrency(amount)} saved</p>
            <p className="text-sm mt-3" style={{ color: "var(--text-secondary)" }}>
              You could use {formatCurrency(skipGive)} from this skip to fund:
            </p>
            <ul className="text-left mt-2 space-y-1" style={{ color: "var(--text-secondary)", fontSize: 13, paddingLeft: 20 }}>
              {nudgeCfc?.unitCost && <li>{formatUnits(skipGive, nudgeCfc.unitCost, nudgeCfc.unitName!)} of a Student&apos;s Education in Cambodia</li>}
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
              onClick={onClose}
              className="mt-2 w-full py-2 text-sm"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            >
              Maybe later
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl relative"
          style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={onClose} className="absolute top-4 right-4 text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
          <div className="text-6xl mb-3">🎉</div>
          <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Great job!</p>
          <p className="font-bold text-lg mt-1" style={{ color: "var(--green-primary)" }}>{formatCurrency(amount)} saved</p>
          <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>{encouragement}</p>

          <div className="mt-5 text-left">
            <p className="text-xs mb-1 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Share</p>
            <textarea
              readOnly
              value={shareText}
              onFocus={(e) => e.target.select()}
              rows={5}
              className="w-full rounded-xl px-3 py-2 text-sm resize-none focus:outline-none"
              style={{
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareText).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="mt-2 w-full font-semibold py-2 rounded-xl text-sm transition-colors"
              style={{
                border: "1px solid var(--border-emphasis)",
                color: "var(--green-primary)",
                background: "transparent",
              }}
            >
              {copied ? "Copied!" : "Copy text"}
            </button>
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
  const spendingGoalLabelLive = activeGoalLive?.label ?? "Live a little";
  const giveGoalAmount = activeProjectLive?.goalAmount ?? 0;
  const giveContribPctLive = giveGoalAmount > 0 ? (skipGiveLive / giveGoalAmount) * 100 : 0;
  const liveGoalAmount = activeGoalLive?.targetAmount ?? 0;
  const liveContribPctLive = liveGoalAmount > 0 ? (skipLiveLive / liveGoalAmount) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Log a Skip</h2>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
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
              <span>🤲 Give <span className="font-bold" style={{ color: "var(--coral-primary)" }}>{skipGivePct}%</span></span>
              <span>😊 Live <span className="font-bold" style={{ color: "#2BBAA4" }}>{100 - skipGivePct}%</span></span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={skipGivePct}
              onChange={(e) => setSkipGivePct(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #E8637A ${skipGivePct}%, #2BBAA4 ${skipGivePct}%)`,
              }}
            />
            <div className="flex justify-between mt-0.5" style={{ fontSize: 10, color: "var(--text-muted)" }}>
              <span>All Give</span>
              <span>All Live</span>
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
                      return formatUnits(skipGiveLive, activeProjectLive.unitCost, activeProjectLive.unitName!);
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
              onClick={() => setShareWithCommunity((v) => !v)}
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
