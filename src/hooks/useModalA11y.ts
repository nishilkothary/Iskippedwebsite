"use client";
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Accessibility wiring shared by all modal dialogs.
 *
 * Attach the returned ref to the dialog's content box (the inner element that
 * carries `role="dialog"`), not the full-screen backdrop. It:
 *  - moves focus into the dialog when it opens,
 *  - closes the dialog on Escape,
 *  - traps Tab focus inside the dialog,
 *  - returns focus to the trigger when the dialog unmounts.
 *
 * The dialog box should also set `tabIndex={-1}` so focus can land on it.
 * `onClose` is read through a ref so passing a fresh closure each render does
 * not re-run the effect (which would otherwise steal focus while typing).
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void
) {
  const containerRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;

    // Move focus into the dialog on open — unless focus already landed inside
    // it (e.g. React's `autoFocus` ran during commit). Otherwise focus the
    // dialog box itself so screen readers announce its role and label.
    if (container && !container.contains(document.activeElement)) {
      const autoFocusEl = container.querySelector<HTMLElement>("[autofocus]");
      (autoFocusEl ?? container).focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const node = containerRef.current;
      if (!node) return;
      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !node.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !node.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Return focus to whatever opened the dialog.
      previouslyFocused?.focus?.();
    };
    // Run once per mount — see note above about onCloseRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return containerRef;
}
