import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  path: "/home", query: new URLSearchParams(), profile: {} as any,
  target: null as any, showingSkip: false,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.path, useSearchParams: () => state.query,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/hooks/useProjects", () => ({ useProjects: () => ({ projects: [{ id: "books", title: "Books for students" }] }) }));
vi.mock("@/store/authStore", () => ({ useAuthStore: () => ({
  user: { uid: "test-user" }, profile: state.profile, updateProfile: vi.fn(),
}) }));
vi.mock("@/store/uiStore", () => ({ useUIStore: () => ({ showSkipPicker: state.showingSkip, setShowSkipPicker: vi.fn() }) }));
vi.mock("@/lib/services/firebase/users", () => ({
  completeFirstRunOnboarding: vi.fn(), setSavingMotivation: vi.fn(),
  normalizeSpendingGoals: (profile: any) => ({ goals: profile.spendingGoals ?? [] }),
}));
vi.mock("@/lib/utils/skipTargets", () => ({ getActiveSkipTarget: () => state.target }));

import { FirstRunOnboarding } from "./FirstRunOnboarding";
const render = () => renderToStaticMarkup(<FirstRunOnboarding />);

beforeEach(() => {
  state.path = "/home";
  state.query = new URLSearchParams();
  state.profile = { uid: "test-user", onboardingCompletedAt: null };
  state.target = null;
  state.showingSkip = false;
});

describe("connected first-run onboarding", () => {
  it("explains how to choose a fundraiser before browsing", () => {
    state.profile.savingMotivation = "fundraiser";
    const html = render();
    expect(html).toContain("Find a fundraiser to save for");
    expect(html).toContain("Skip for This");
    expect(html).toContain("Then set your personal savings goal.");
  });
  it("acknowledges a fundraiser goal and explains donating", () => {
    state.target = { type: "fundraiser", id: "books" };
    const html = render();
    expect(html).toContain("You’ve set your goal!");
    expect(html).toContain("Books for students");
    expect(html).toContain("at any time.");
    expect(html).toContain("Log Your First Skip");
  });
  it("uses reward-specific language after adding a reward", () => {
    state.target = { type: "goal", id: "trip" };
    state.profile.spendingGoals = [{ id: "trip", label: "A weekend away" }];
    const html = render();
    expect(html).toContain("You’ve set your goal!");
    expect(html).toContain("A weekend away");
    expect(html).toContain("to buy your reward.");
    expect(html).not.toContain("donate");
  });
  it.each(["save-more", "decide-later"])("explains the scoreboard and Skip Jars for %s", (motivation) => {
    state.profile.savingMotivation = motivation;
    const html = render();
    expect(html).toContain("See how your savings add up");
    expect(html).toContain("Your Skip Scoreboard will show how those savings add up.");
    expect(html).toContain("in the Skip Jars tab.");
    expect(html).toContain("Log Your First Skip");
  });
  it.each([null, { type: "fundraiser", id: "books" }])("leaves invite prompts to the invite page (target: %j)", (target) => {
    state.path = "/challenges/books";
    state.query = new URLSearchParams("invite=1");
    state.target = target;
    expect(render()).toBe("");
  });
  it("does not overlay the purpose-selection forms", () => {
    state.profile.savingMotivation = "reward";
    state.query = new URLSearchParams("onboarding=choose");
    expect(render()).toBe("");
  });
  it("does not interrupt the skip picker or legacy accounts", () => {
    state.showingSkip = true;
    expect(render()).toBe("");
    state.showingSkip = false;
    delete state.profile.onboardingCompletedAt;
    expect(render()).toBe("");
  });
});
