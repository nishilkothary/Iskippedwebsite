"use client";
import { useState } from "react";
import { useSkips } from "@/hooks/useSkips";
import { useProjects } from "@/hooks/useProjects";
import { useAuthStore } from "@/store/authStore";
import { SKIP_CATEGORIES } from "@/lib/constants/skipCategories";
import { formatCurrency } from "@/lib/utils/currency";
import { normalizeJarSplit } from "@/lib/services/firebase/users";

interface Props {
  onClose: () => void;
}

export function SkipModal({ onClose }: Props) {
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
  const [notes, setNotes] = useState("");
  const [shareWithCommunity, setShareWithCommunity] = useState(true);
  const [projectId] = useState<string | null>(profile?.activeProjectId ?? null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [successProjectTitle, setSuccessProjectTitle] = useState<string | null>(null);
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
      shareWithCommunity,
      whatSkipped: whatSkipped || undefined,
      notes: notes || undefined,
      jarSplit: { give: skipGivePct, live: 100 - skipGivePct },
    });
    if (result) {
      setSuccessProjectTitle(selectedProject?.title ?? null);
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
    const causeTitle = successProjectTitle ?? "a good cause";
    const causeSentence = causeTitle.charAt(0).toLowerCase() + causeTitle.slice(1);
    const shareText = `I skipped ${itemLabel} and saved ${formatCurrency(skipGive)} for ${causeSentence}! Every skip makes a difference. Join the movement on Iskipped.com`;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
          <button onClick={onClose} className="absolute top-4 right-4 text-[#9CA3AF] hover:text-[#111827] text-2xl leading-none">×</button>
          <div className="text-6xl mb-3">🎉</div>
          <p className="text-2xl font-bold text-[#111827]">Great job!</p>
          <p className="text-[#3D8B68] font-bold text-lg mt-1">{formatCurrency(amount)} saved</p>
          <p className="text-[#6B7280] text-sm mt-2">{encouragement}</p>

          {/* 2-jar impact */}
          <div className="mt-4 bg-[#F9FAFB] rounded-xl p-4 space-y-2 text-left">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#6B7280]">🤲 {successActiveProject?.title ?? "Give a little"}</span>
              <div className="text-right">
                <span className="text-sm font-bold text-[#E8637A]">{skipGivePct}%</span>
                <span className="text-xs text-[#9CA3AF] ml-1">+{formatCurrency(skipGive)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#6B7280]">😊 {spendingGoalLabel}</span>
              <div className="text-right">
                <span className="text-sm font-bold text-[#2BBAA4]">{100 - skipGivePct}%</span>
                <span className="text-xs text-[#9CA3AF] ml-1">+{formatCurrency(skipLive)}</span>
              </div>
            </div>
          </div>

          <div className="mt-5 text-left">
            <p className="text-xs text-[#6B7280] mb-1 uppercase tracking-wide">Share</p>
            <textarea
              readOnly
              value={shareText}
              onFocus={(e) => e.target.select()}
              rows={3}
              className="w-full border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm text-[#111827] bg-[#F9FAFB] resize-none focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareText).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="mt-2 w-full border border-[#3D8B68] text-[#3D8B68] font-semibold py-2 rounded-xl hover:bg-[#E4F0E8] transition-colors text-sm"
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
  const spendingGoalLabelLive = profile?.spendingGoal?.label ?? "Live a little";
  const activeProjectLive = projects.find((p) => p.id === profile?.activeProjectId) ?? null;
  const giveGoalAmount = activeProjectLive?.goalAmount ?? 0;
  const giveContribPctLive = giveGoalAmount > 0 ? (skipGiveLive / giveGoalAmount) * 100 : 0;
  const liveGoalAmount = profile?.spendingGoal?.targetAmount ?? 0;
  const liveContribPctLive = liveGoalAmount > 0 ? (skipLiveLive / liveGoalAmount) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E7EB]">
          <h2 className="text-lg font-bold text-[#111827]">Log a Skip</h2>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#111827] text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* What did you skip */}
          <div>
            <label className="block text-sm font-medium text-[#111827] mb-2">What did you skip?</label>
            <input
              type="text"
              value={whatSkipped}
              onChange={(e) => setWhatSkipped(e.target.value)}
              placeholder={`e.g. "morning latte at Starbucks"`}
              className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30 focus:border-[#3D8B68]"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-[#111827] mb-2">Amount skipped</label>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-[#3D8B68]">$</span>
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
                className="w-28 text-2xl font-bold text-[#3D8B68] border-b-2 border-[#3D8B68] focus:outline-none bg-transparent"
              />
            </div>
            {amount > 0 && (
              <div className="mt-3 space-y-2">
                {/* Give jar — highlighted cause progress */}
                <div className="bg-[#FFF0F2] border border-[#E8637A]/30 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#6B7280]">💚 {activeProjectLive?.title ?? "Give a little"}</span>
                    <span className="text-xs text-[#6B7280]">+{formatCurrency(skipGiveLive)}</span>
                  </div>
                  {giveGoalAmount > 0 ? (
                    <>
                      <p className="text-lg font-extrabold text-[#E8637A] leading-tight">
                        +{giveContribPctLive.toFixed(1)}% towards {activeProjectLive?.title ?? "your cause"}
                      </p>
                      <div className="mt-1.5 h-1.5 bg-[#E8637A]/20 rounded-full overflow-hidden">
                        <div className="h-full bg-[#E8637A] rounded-full" style={{ width: `${Math.min(100, giveContribPctLive)}%` }} />
                      </div>
                    </>
                  ) : (
                    <p className="text-sm font-bold text-[#E8637A]">+{formatCurrency(skipGiveLive)} to give jar</p>
                  )}
                </div>
                {/* Live jar */}
                <div className="bg-[#F0FDFB] border border-[#2BBAA4]/30 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#6B7280]">✨ {spendingGoalLabelLive}</span>
                    <span className="text-xs text-[#6B7280]">+{formatCurrency(skipLiveLive)}</span>
                  </div>
                  {liveGoalAmount > 0 ? (
                    <>
                      <p className="text-lg font-extrabold text-[#2BBAA4] leading-tight">
                        +{liveContribPctLive.toFixed(1)}% towards {spendingGoalLabelLive}
                      </p>
                      <div className="mt-1.5 h-1.5 bg-[#2BBAA4]/20 rounded-full overflow-hidden">
                        <div className="h-full bg-[#2BBAA4] rounded-full" style={{ width: `${Math.min(100, liveContribPctLive)}%` }} />
                      </div>
                    </>
                  ) : (
                    <p className="text-sm font-bold text-[#2BBAA4]">+{formatCurrency(skipLiveLive)} to live jar</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Per-skip split slider */}
          <div>
            <label className="block text-sm font-medium text-[#111827] mb-2">This skip's split</label>
            <div className="flex items-center justify-between text-xs text-[#6B7280] mb-1">
              <span>🤲 Give <span className="font-bold text-[#E8637A]">{skipGivePct}%</span></span>
              <span>😊 Live <span className="font-bold text-[#2BBAA4]">{100 - skipGivePct}%</span></span>
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
            <div className="flex justify-between text-[10px] text-[#9CA3AF] mt-0.5">
              <span>All Give</span>
              <span>All Live</span>
            </div>
          </div>

          {/* Categories */}
          <div>
            <label className="block text-sm font-medium text-[#111827] mb-2">Category</label>
            <div className="grid grid-cols-4 gap-2">
              {SKIP_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCatSelect(cat)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-sm transition-all ${
                    selectedCat.id === cat.id
                      ? "border-[#3D8B68] bg-[#E4F0E8] text-[#3D8B68]"
                      : "border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#3D8B68]/40"
                  }`}
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
                className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30 focus:border-[#3D8B68] mt-2"
              />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-[#111827] mb-2">Personal notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any thoughts?"
              rows={2}
              className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#3D8B68]/30 focus:border-[#3D8B68] resize-none"
            />
          </div>

          {/* Share toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setShareWithCommunity((v) => !v)}
              className={`w-11 h-6 rounded-full transition-colors relative ${shareWithCommunity ? "bg-[#3D8B68]" : "bg-[#E5E7EB]"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${shareWithCommunity ? "translate-x-5" : ""}`}
              />
            </div>
            <span className="text-sm text-[#111827]">Share skip with our community (it makes a difference!)</span>
          </label>
        </div>

        {/* Submit */}
        <div className="px-6 pb-6">
          <button
            onClick={handleSubmit}
            disabled={isLogging || amount <= 0}
            className="w-full bg-[#3D8B68] hover:bg-[#2D6A4F] text-white font-bold py-4 rounded-xl text-base transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLogging ? "Saving…" : amount > 0 ? `Skip ${formatCurrency(amount)}` : "Enter an amount"}
          </button>
        </div>
      </div>
    </div>
  );
}
