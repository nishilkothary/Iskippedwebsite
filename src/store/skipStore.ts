"use client";
import { create } from "zustand";
import { Skip } from "@/lib/types/models";

interface SkipState {
  recentSkips: Skip[];
  isLogging: boolean;
  lastLoggedSkip: Skip | null;
  setRecentSkips: (skips: Skip[]) => void;
  addSkip: (skip: Skip) => void;
  updateSkip: (skipId: string, updates: Partial<Skip>) => void;
  removeSkip: (skipId: string) => void;
  setLogging: (loading: boolean) => void;
  setLastLoggedSkip: (skip: Skip | null) => void;
}

export const useSkipStore = create<SkipState>((set) => ({
  recentSkips: [],
  isLogging: false,
  lastLoggedSkip: null,
  setRecentSkips: (recentSkips) => set({ recentSkips }),
  addSkip: (skip) =>
    set((state) => ({ recentSkips: [skip, ...state.recentSkips].slice(0, 50) })),
  updateSkip: (skipId, updates) =>
    set((state) => ({
      recentSkips: state.recentSkips.map((s) =>
        s.id === skipId ? { ...s, ...updates } : s
      ),
    })),
  removeSkip: (skipId) =>
    set((state) => ({
      recentSkips: state.recentSkips.filter((s) => s.id !== skipId),
    })),
  setLogging: (isLogging) => set({ isLogging }),
  setLastLoggedSkip: (lastLoggedSkip) => set({ lastLoggedSkip }),
}));
