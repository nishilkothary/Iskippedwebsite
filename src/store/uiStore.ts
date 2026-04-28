"use client";
import { create } from "zustand";

interface UIState {
  showSkipPicker: boolean;
  setShowSkipPicker: (show: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  showSkipPicker: false,
  setShowSkipPicker: (showSkipPicker) => set({ showSkipPicker }),
}));
