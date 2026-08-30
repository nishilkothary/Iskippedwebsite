import { describe, expect, it } from "vitest";
import { setupPromptAction } from "./setupPrompt";

const installed = { installed: true, canInstall: false, pushSupported: true, notificationDenied: false,
  pushOptIn: false, installCompleted: true, installSnoozed: false, reminderDismissed: false };

describe("installation and notification setup", () => {
  it("prompts for reminders after installation is completed", () => {
    expect(setupPromptAction(installed)).toBe("notifications");
  });
  it("does not carry an installation snooze into the notification stage", () => {
    expect(setupPromptAction({ ...installed, installSnoozed: true })).toBe("notifications");
  });
  it.each([{ pushSupported: false }, { notificationDenied: true }, { pushOptIn: true }, { reminderDismissed: true }])(
    "respects notification eligibility: %j", (override) => {
      expect(setupPromptAction({ ...installed, ...override })).toBeNull();
    });
  it("never asks a browser tab for notifications", () => {
    expect(setupPromptAction({ ...installed, installed: false })).toBeNull();
  });
  it("offers installation first and respects its dismissal", () => {
    const browser = { ...installed, installed: false, canInstall: true, installCompleted: false };
    expect(setupPromptAction(browser)).toBe("install");
    expect(setupPromptAction({ ...browser, installSnoozed: true })).toBeNull();
  });
});
