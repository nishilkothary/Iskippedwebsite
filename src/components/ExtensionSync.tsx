"use client";

import { useEffect, useMemo } from "react";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { normalizeSpendingGoals } from "@/lib/services/firebase/users";

declare global {
  interface Window {
    __ISKIPPED_EXTENSION_SYNCED_AT__?: number;
  }
}

export function ExtensionSync() {
  const { profile } = useAuthStore();
  const { projects } = useProjects();

  const payload = useMemo(() => {
    if (!profile?.activeProjectId) return null;
    const project = projects.find((candidate) => candidate.id === profile.activeProjectId);
    if (!project) return null;
    const { goals, activeId: activeGoalId } = normalizeSpendingGoals(profile);
    const activeGoal = goals.find((goal) => goal.id === activeGoalId) ?? null;

    return {
      activeCauseId: project.id,
      title: project.groupName || project.title,
      projectTitle: project.title,
      location: project.location ?? null,
      unitName: project.unitName ?? null,
      unitDisplay: project.unitDisplay ?? null,
      unitCost: project.unitCost ?? null,
      unitIsGoal: project.unitIsGoal === true,
      unitPhrase: project.unitPhrase ?? null,
      givePercent: profile.jarSplit?.give ?? 50,
      livePercent: profile.jarSplit?.live ?? 50,
      rewardGoalLabel: activeGoal?.label ?? null,
      rewardGoalTargetAmount: activeGoal?.targetAmount ?? null,
      syncVersion: 2,
      updatedAt: Date.now(),
    };
  }, [profile, projects]);

  useEffect(() => {
    const encodedPayload = JSON.stringify(payload);
    document.documentElement.setAttribute("data-iskipped-extension-summary", encodedPayload);
    window.dispatchEvent(
      new CustomEvent("iskipped-extension-sync", {
        detail: encodedPayload,
      })
    );
    window.__ISKIPPED_EXTENSION_SYNCED_AT__ = Date.now();
  }, [payload]);

  return null;
}
