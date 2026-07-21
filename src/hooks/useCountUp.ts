"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from `from` up to `target` over `ms` using requestAnimationFrame.
 * Respects prefers-reduced-motion (jumps straight to target). Restarts when `target` changes.
 */
export function useCountUp(target: number, ms = 900, from = 0): number {
  const [value, setValue] = useState(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || ms <= 0 || target === from) {
      setValue(target);
      return;
    }

    const start = performance.now();
    setValue(from);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else setValue(target);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, ms, from]);

  return value;
}
