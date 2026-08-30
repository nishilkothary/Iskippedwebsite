import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  path: "/home", query: new URLSearchParams(), profile: {} as any,
  target: null as any, showingSkip: false,
  updateProfile: vi.fn(), completeOnboarding: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.path, useSearchParams: () => state.query,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/hooks/useProjects", () => ({ useProjects: () => ({ projects: [{ id: "books", title: "Books for students" }] }) }));
vi.mock("@/store/authStore", () => ({ useAuthStore: () => ({
  user: { uid: "test-user" }, profile: state.profile, updateProfile: state.updateProfile,
}) }));
vi.mock("@/store/uiStore", () => ({ useUIStore: () => ({ showSkipPicker: state.showingSkip, setShowSkipPicker: vi.fn() }) }));
vi.mock("@/lib/services/firebase/users", () => ({
  completeFirstRunOnboarding: state.completeOnboarding, setSavingMotivation: vi.fn(),
  normalizeSpendingGoals: (profile: any) => ({ goals: profile.spendingGoals ?? [] }),
}));
vi.mock("@/lib/utils/skipTargets", () => ({ getActiveSkipTarget: () => state.target }));

import { FirstRunOnboarding } from "./FirstRunOnboarding";
import { ONBOARDING_REWARD_HREF, rewardFormReadyHref } from "@/lib/utils/rewardFormNavigation";
const render = () => renderToStaticMarkup(<FirstRunOnboarding />);

beforeEach(() => {
  state.path = "/home";
  state.query = new URLSearchParams();
  state.profile = { uid: "test-user", onboardingCompletedAt: null };
  state.target = null;
  state.showingSkip = false;
  state.updateProfile.mockReset().mockImplementation((updates) => {
    state.profile = { ...state.profile, ...updates };
  });
  state.completeOnboarding.mockReset().mockResolvedValue(undefined);
});

describe("connected first-run onboarding", () => {
  it("introduces the reward form as the next step", () => {
    state.profile.savingMotivation = "reward";
    const html = render();
    expect(html).toContain("Great! Let’s get you started on your goal.");
    expect(html).toContain("Add an item, experience, or goal you want your savings to help pay for.");
  });
  it("keeps onboarding hidden after the reward page consumes its form-opening parameters", () => {
    state.profile.savingMotivation = "reward";
    const destination = new URL(ONBOARDING_REWARD_HREF, "https://iskipped.com");
    state.path = destination.pathname;
    state.query = destination.searchParams;
    expect(state.query.get("add")).toBe("reward");
    expect(state.query.get("skip")).toBe("1");
    expect(render()).toBe("");

    const cleaned = new URL(rewardFormReadyHref(state.query.get("onboarding") === "choose"), destination);
    state.query = cleaned.searchParams;
    expect(state.query.get("add")).toBeNull();
    expect(state.query.get("onboarding")).toBe("choose");
    expect(render()).toBe("");

    // Saving/activating a reward still advances to the first-skip prompt.
    state.target = { type: "goal", id: "trip" };
    state.profile.spendingGoals = [{ id: "trip", label: "A weekend away" }];
    expect(render()).toContain("Log Your First Skip");
  });
  it("does not add onboarding markers to ordinary reward creation", () => {
    expect(rewardFormReadyHref(false)).toBe("/jars?tab=live");
  });
  it.each(["reward", "fundraiser", "save-more", "decide-later"])("can dismiss and save dismissal of the %s first-skip prompt", (motivation) => {
    state.profile.savingMotivation = motivation;
    if (motivation === "reward") state.target = { type: "goal", id: "trip" };
    if (motivation === "fundraiser") state.target = { type: "fundraiser", id: "books" };
    const prompt = FirstRunOnboarding();
    expect(prompt?.props.onClose).toBeTypeOf("function");
    prompt!.props.onClose();
    expect(state.completeOnboarding).toHaveBeenCalledWith("test-user");
    expect(state.profile.onboardingCompletedAt).not.toBeNull();
    expect(render()).toBe("");
  });
  it("explains how to choose a fundraiser before browsing", () => {
    state.profile.savingMotivation = "fundraiser";
    const html = render();
    expect(html).toContain("Find a fundraiser to save for");
    expect(html).toContain("Skip for This");
    expect(html).toContain("Then set your personal donation goal.");
  });
  it("acknowledges a fundraiser goal and explains donating", () => {
    state.target = { type: "fundraiser", id: "books" };
    const html = render();
    expect(html).toContain("You’ve set your goal!");
    expect(html).toContain("Books for students");
    expect(html).toContain("at any time.");
    expect(html).toContain("Log Your First Skip");
    expect(html).toContain('aria-label="Close onboarding"');
  });
  it("uses reward-specific language after adding a reward", () => {
    state.target = { type: "goal", id: "trip" };
    state.profile.spendingGoals = [{ id: "trip", label: "A weekend away" }];
    const html = render();
    expect(html).toContain("You’ve set your goal!");
    expect(html).toContain("A weekend away");
    expect(html).toContain("to buy your reward.");
    expect(html).not.toContain("donate");
    expect(html).toContain('aria-label="Close onboarding"');
  });
  it.each(["save-more", "decide-later"])("explains the scoreboard and Skip Jars for %s", (motivation) => {
    state.profile.savingMotivation = motivation;
    const html = render();
    expect(html).toContain("See Your Savings Grow");
    expect(html).toContain("text-[clamp(1rem,5vw,1.5rem)]");
    expect(html).toContain("Your Skip Scoreboard will show how those savings add up.");
    expect(html).toContain("in the Skip Jars tab.");
    expect(html).toContain("Log Your First Skip");
    expect(html).toContain('aria-label="Close onboarding"');
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
