export function setupPromptAction(state: {
  installed: boolean;
  canInstall: boolean;
  pushSupported: boolean;
  notificationDenied: boolean;
  pushOptIn: boolean;
  installCompleted: boolean;
  installSnoozed: boolean;
  reminderDismissed: boolean;
}): "install" | "notifications" | null {
  if (state.installed) {
    return state.pushSupported && !state.notificationDenied && !state.pushOptIn && !state.reminderDismissed
      ? "notifications" : null;
  }
  return state.canInstall && !state.installCompleted && !state.installSnoozed ? "install" : null;
}
