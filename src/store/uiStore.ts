"use client";
import { create } from "zustand";

interface UIState {
  showSkipPicker: boolean;
  showSkipSuccess: boolean;
  selectedProjectId: string | null;
  pendingDonationCauseId: string | null;
  setShowSkipPicker: (show: boolean) => void;
  setShowSkipSuccess: (show: boolean) => void;
  setSelectedProjectId: (id: string | null) => void;
  setPendingDonation: (causeId: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  showSkipPicker: false,
  showSkipSuccess: false,
  selectedProjectId: null,
  pendingDonationCauseId: null,
  setShowSkipPicker: (showSkipPicker) => set({ showSkipPicker }),
  setShowSkipSuccess: (showSkipSuccess) => set({ showSkipSuccess }),
  setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
  setPendingDonation: (pendingDonationCauseId) => set({ pendingDonationCauseId }),
}));
