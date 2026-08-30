"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useProjects } from "@/hooks/useProjects";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import {
  normalizeSpendingGoals,
  setSavingMotivation,
  type SavingMotivation,
} from "@/lib/services/firebase/users";
import { getActiveSkipTarget } from "@/lib/utils/skipTargets";

const GENERAL_COPY = "Start by logging something you decided not to buy. Your Skip Scoreboard will show how your skipped spending adds up over time—so you can put those savings toward something more meaningful to you.";

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
  const targetLabel = activeTarget?.type === "goal"
    ? goals.find((goal) => goal.id === activeTarget.id)?.label ?? "your reward"
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

  // An invited user should first see and join the fundraiser they came for.
  // As soon as it becomes their active target, the named first-skip prompt appears.
  if (isInviteRoute && activeTarget?.type !== "fundraiser") return null;

  if (activeTarget && targetLabel) {
    const purposeCopy = activeTarget.type === "fundraiser"
      ? <>Log what you skip. Watch your savings grow. Donate when you&apos;re ready.</>
      : <>Log what you skip. Watch your savings grow. Use them for your reward when you&apos;re ready.</>;
    return (
      <OnboardingModal title={`Start saving for ${targetLabel}`}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {purposeCopy}
        </p>
        <PrimaryButton onClick={() => void logFirstSkip()}>Log a Skip</PrimaryButton>
      </OnboardingModal>
    );
  }

  if (isChoosingPurpose && (motivation === "reward" || motivation === "fundraiser")) {
    return (
      <div className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-xl rounded-2xl p-4 shadow-2xl md:bottom-6" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-emphasis)" }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black" style={{ color: "var(--text-primary)" }}>
              {motivation === "reward" ? "Choose a reward to save toward" : "Choose a fundraiser to support"}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>Your first skip will be tracked toward it.</p>
          </div>
          <button type="button" onClick={() => void decideLater()} className="shrink-0 text-xs font-black underline" style={{ color: "var(--green-primary)" }}>
            Decide later
          </button>
        </div>
      </div>
    );
  }

  if (motivation === "reward") {
    return (
      <OnboardingModal eyebrow="Personal reward" title="Choose something worth saving for">
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>Add the purchase or experience you want your skipped spending to help pay for.</p>
        <div className="space-y-2">
          <PrimaryButton onClick={() => router.push("/jars?tab=live&add=reward&skip=1&onboarding=choose")}>Add What I&apos;m Saving For</PrimaryButton>
          <LaterButton onClick={() => void decideLater()} />
        </div>
      </OnboardingModal>
    );
  }

  if (motivation === "fundraiser") {
    return (
      <OnboardingModal eyebrow="Support a cause" title="Choose a fundraiser">
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>Browse fundraisers and choose a cause you want your skipped spending to support.</p>
        <div className="space-y-2">
          <PrimaryButton onClick={() => router.push("/jars?tab=fundraisers&onboarding=choose")}>Browse Fundraisers</PrimaryButton>
          <LaterButton onClick={() => void decideLater()} />
        </div>
      </OnboardingModal>
    );
  }

  if (motivation === "save-more" || motivation === "decide-later") {
    return (
      <OnboardingModal eyebrow={motivation === "save-more" ? "See what adds up" : "No goal needed yet"} title="Log your first skip">
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

function OnboardingModal({ eyebrow, title, children }: { eyebrow?: string; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <section role="dialog" aria-modal="true" aria-labelledby="first-run-title" className="w-full max-w-lg rounded-3xl p-5 shadow-2xl sm:p-6" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-emphasis)" }}>
        {eyebrow && <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--green-primary)" }}>{eyebrow}</p>}
        <h1 id="first-run-title" className={`${eyebrow ? "mt-2 " : ""}text-2xl font-black leading-tight sm:text-3xl`} style={{ color: "var(--text-primary)" }}>{title}</h1>
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
