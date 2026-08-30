"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useProjects } from "@/hooks/useProjects";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import {
  completeFirstRunOnboarding,
  normalizeSpendingGoals,
  setSavingMotivation,
  type SavingMotivation,
} from "@/lib/services/firebase/users";
import { getActiveSkipTarget } from "@/lib/utils/skipTargets";
import { ONBOARDING_REWARD_HREF } from "@/lib/utils/rewardFormNavigation";

const GENERAL_COPY = "Start by logging something you decided not to buy. Your Skip Scoreboard will show how those savings add up. Whenever you’re ready, choose a cause or reward to save for in the Skip Jars tab.";

const motivationOptions: Array<{
  value: SavingMotivation;
  title: string;
  icon: string;
}> = [
  { value: "reward", title: "Something I’m hoping to buy", icon: "🎁" },
  { value: "fundraiser", title: "A cause I want to support", icon: "💚" },
  { value: "save-more", title: "Seeing how much I can save", icon: "📈" },
  { value: "decide-later", title: "I’ll decide later", icon: "✨" },
];

export function FirstRunOnboarding() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, profile, updateProfile } = useAuthStore();
  const { projects } = useProjects();
  const { showSkipPicker, setShowSkipPicker } = useUIStore();

  // undefined identifies accounts created before this onboarding existed.
  // Only an explicit null is a new account that still needs the flow.
  if (!user || !profile || profile.onboardingCompletedAt !== null || showSkipPicker) return null;
  const uid = user.uid;

  const motivation = profile.savingMotivation;
  const activeTarget = getActiveSkipTarget(profile);
  const goals = normalizeSpendingGoals(profile).goals;
  const activeGoal = activeTarget?.type === "goal"
    ? goals.find((goal) => goal.id === activeTarget.id)
    : undefined;
  const targetLabel = activeTarget?.type === "goal"
    ? activeGoal?.label ?? "your reward"
    : activeTarget?.type === "fundraiser"
      ? projects.find((project) => project.id === activeTarget.id)?.groupName
        ?? projects.find((project) => project.id === activeTarget.id)?.title
        ?? "your fundraiser"
      : null;
  const isInviteRoute = pathname.startsWith("/challenges/") && searchParams.get("invite") === "1";
  const isChoosingPurpose = searchParams.get("onboarding") === "choose"
    || (motivation === "fundraiser" && pathname === "/challenges" && searchParams.get("create") === "1");

  async function chooseMotivation(next: SavingMotivation) {
    updateProfile({ savingMotivation: next });
    try {
      await setSavingMotivation(uid, next);
    } catch {
      // The optimistic state keeps onboarding usable; the live profile listener
      // will restore the server value if the write truly failed.
    }
  }

  async function decideLater() {
    await chooseMotivation("decide-later");
    router.push("/home");
  }

  async function logFirstSkip() {
    if (!motivation && activeTarget?.type === "fundraiser") {
      await chooseMotivation("fundraiser");
    }
    setShowSkipPicker(true);
  }

  async function dismissOnboarding() {
    updateProfile({ onboardingCompletedAt: new Date() as any });
    try {
      await completeFirstRunOnboarding(uid);
    } catch {
      updateProfile({ onboardingCompletedAt: null });
    }
  }

  // The invite page owns its entire join/goal/first-skip sequence. Do not put
  // another onboarding modal over it after the fundraiser becomes active.
  if (isInviteRoute) return null;

  if (activeTarget && targetLabel) {
    const purposeCopy = activeTarget.type === "fundraiser"
      ? <>Now it&apos;s simple: skip an expense, log it here, and watch your savings toward <strong>{targetLabel}</strong> grow. You can donate what you&apos;ve saved at any time.</>
      : <>Now it&apos;s simple: skip an expense, log it here, and watch your savings toward <strong>{targetLabel}</strong> grow. When you&apos;re ready, use what you&apos;ve saved to buy your reward.</>;
    return (
      <OnboardingModal title="You’ve set your goal!" onClose={() => void dismissOnboarding()}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {purposeCopy}
        </p>
        <PrimaryButton onClick={() => void logFirstSkip()}>Log Your First Skip</PrimaryButton>
      </OnboardingModal>
    );
  }

  if (isChoosingPurpose && (motivation === "reward" || motivation === "fundraiser")) {
    // The destination page owns the reward/fundraiser selection UI. Keeping an
    // onboarding layer here can cover mobile forms and their primary actions.
    return null;
  }

  if (motivation === "reward") {
    return (
      <OnboardingModal title="Great! Let’s get you started on your goal.">
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>Add an item, experience, or goal you want your savings to help pay for.</p>
        <div className="space-y-2">
          <PrimaryButton onClick={() => router.push(ONBOARDING_REWARD_HREF)}>Add What I&apos;m Saving For</PrimaryButton>
          <LaterButton onClick={() => void decideLater()} />
        </div>
      </OnboardingModal>
    );
  }

  if (motivation === "fundraiser") {
    return (
      <OnboardingModal title="Find a fundraiser to save for">
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>Browse fundraisers and tap <strong>Skip for This</strong> on one you&apos;d like to support. Then set your personal savings goal.</p>
        <div className="space-y-2">
          <PrimaryButton onClick={() => router.push("/jars?tab=fundraisers&onboarding=choose")}>Browse Fundraisers</PrimaryButton>
          <LaterButton onClick={() => void decideLater()} />
        </div>
      </OnboardingModal>
    );
  }

  if (motivation === "save-more" || motivation === "decide-later") {
    return (
      <OnboardingModal title="See Your Savings Grow" compactTitle onClose={() => void dismissOnboarding()}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{GENERAL_COPY}</p>
        <PrimaryButton onClick={() => void logFirstSkip()}>Log Your First Skip</PrimaryButton>
      </OnboardingModal>
    );
  }

  return (
    <OnboardingModal eyebrow="Welcome to iSkipped" title="What’s motivating you to save more?">
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {motivationOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => void chooseMotivation(option.value)}
            className="flex items-center gap-3 rounded-xl p-4 text-left transition-transform hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-default)" }}
          >
            <span className="shrink-0 text-xl" aria-hidden="true">{option.icon}</span>
            <span className="text-sm font-black" style={{ color: "var(--text-primary)" }}>{option.title}</span>
          </button>
        ))}
      </div>
    </OnboardingModal>
  );
}

function OnboardingModal({ eyebrow, title, children, onClose, compactTitle = false }: { eyebrow?: string; title: string; children: React.ReactNode; onClose?: () => void; compactTitle?: boolean }) {
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="first-run-title" className="relative w-full max-w-lg rounded-3xl p-5 shadow-2xl sm:p-6" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-emphasis)" }}>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close onboarding"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-2xl font-bold"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}
          >
            ×
          </button>
        )}
        {eyebrow && <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--green-primary)" }}>{eyebrow}</p>}
        <h1 id="first-run-title" className={`${eyebrow ? "mt-2 " : ""}${onClose ? "pr-10 " : ""}${compactTitle ? "text-[clamp(1rem,5vw,1.5rem)]" : "text-2xl"} font-black leading-tight sm:text-3xl`} style={{ color: "var(--text-primary)" }}>{title}</h1>
        <div className="mt-3 space-y-4">{children}</div>
      </section>
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="w-full rounded-full px-4 py-3 text-sm font-black" style={{ background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))", color: "var(--bg-base)", boxShadow: "0 4px 18px var(--gold-glow)" }}>{children}</button>;
}

function LaterButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="w-full px-4 py-2 text-xs font-black" style={{ color: "var(--text-muted)" }}>Decide Later</button>;
}
