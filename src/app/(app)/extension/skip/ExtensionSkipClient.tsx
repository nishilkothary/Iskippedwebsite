"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import { useSkips } from "@/hooks/useSkips";
import { SKIP_CATEGORIES } from "@/lib/constants/skipCategories";
import { formatCurrency } from "@/lib/utils/currency";

type Status = "waiting" | "logging" | "success" | "error";

const SHOPPING_CATEGORY = SKIP_CATEGORIES.find((category) => category.id === "shopping") ?? {
  id: "shopping",
  label: "Shopping",
  emoji: "",
};

function parseAmount(value: string | null) {
  if (!value) return null;
  const amount = Number(value.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) return null;
  return Math.round(amount * 100) / 100;
}

function cleanText(value: string | null, fallback: string) {
  const text = value?.trim().replace(/\s+/g, " ");
  if (!text) return fallback;
  return text.slice(0, 90);
}

function hostFromUrl(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function ExtensionSkipClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile } = useAuthStore();
  const { projects, loading: projectsLoading } = useProjects();
  const { log } = useSkips();
  const submittedRef = useRef(false);
  const [status, setStatus] = useState<Status>("waiting");
  const [message, setMessage] = useState("Preparing your skip...");

  const amount = useMemo(() => parseAmount(searchParams.get("amount")), [searchParams]);
  const item = useMemo(
    () => cleanText(searchParams.get("item"), cleanText(searchParams.get("merchant"), "online purchase")),
    [searchParams]
  );
  const sourceHost = useMemo(() => hostFromUrl(searchParams.get("sourceUrl")), [searchParams]);

  const activeProject = useMemo(() => {
    const activeProjectId = profile?.activeSkipTarget?.type === "fundraiser"
      ? profile.activeSkipTarget.id
      : profile?.activeProjectId;
    if (!activeProjectId) return null;
    return projects.find((project) => project.id === activeProjectId) ?? null;
  }, [profile?.activeProjectId, profile?.activeSkipTarget, projects]);

  useEffect(() => {
    if (submittedRef.current) return;
    if (!user || !profile) return;
    if (profile.activeProjectId && projectsLoading) return;

    if (!amount) {
      submittedRef.current = true;
      setStatus("error");
      setMessage("We need a valid amount to log this skip.");
      return;
    }

    submittedRef.current = true;
    setStatus("logging");
    setMessage(`Logging ${formatCurrency(amount)} skipped from Chrome...`);

    log({
      category: SHOPPING_CATEGORY.id,
      categoryLabel: SHOPPING_CATEGORY.label,
      categoryEmoji: SHOPPING_CATEGORY.emoji,
      amount,
      projectId: activeProject?.id ?? null,
      projectTitle: activeProject?.title ?? null,
      projectLocation: activeProject?.location ?? null,
      projectUnitName: activeProject?.unitName ?? null,
      projectUnitCost: activeProject?.unitCost ?? null,
      projectUnitDisplay: activeProject?.unitDisplay ?? null,
      projectUnitIsGoal: activeProject?.unitIsGoal ?? null,
      allocationTarget: activeProject ? { type: "fundraiser", id: activeProject.id } : null,
      whatSkipped: item,
      notes: sourceHost ? `Logged from the Chrome extension on ${sourceHost}.` : "Logged from the Chrome extension.",
      shareWithCommunity: false,
    }).then((result) => {
      if (!result) {
        setStatus("error");
        setMessage("iSkipped could not save this skip.");
        return;
      }
      setStatus("success");
      setMessage(`${formatCurrency(amount)} skipped and added to your jars.`);
      toast.success("Skip logged from Chrome.");
    });
  }, [activeProject, amount, item, log, profile, projectsLoading, sourceHost, user]);

  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <div className="min-h-full px-4 py-10 flex items-center justify-center">
      <section
        className="w-full max-w-md rounded-lg p-6"
        style={{
          background: "var(--bg-surface-1)",
          border: "1px solid var(--border-default)",
          boxShadow: "0 18px 48px rgba(0,0,0,0.22)",
        }}
      >
        <p className="text-sm font-bold" style={{ color: "var(--green-primary)" }}>
          Chrome extension
        </p>
        <h1 className="mt-2 text-2xl font-black" style={{ color: "var(--text-primary)" }}>
          {isSuccess ? "Skip logged" : isError ? "Needs a quick fix" : "Logging your skip"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {message}
        </p>

        {amount && (
          <div
            className="mt-5 rounded-lg p-4"
            style={{
              background: "rgba(46,204,113,0.08)",
              border: "1px solid rgba(46,204,113,0.16)",
            }}
          >
            <p className="text-xs font-bold uppercase" style={{ color: "var(--text-muted)" }}>
              What you skipped
            </p>
            <p className="mt-1 text-lg font-black" style={{ color: "var(--text-primary)" }}>
              {formatCurrency(amount)} on {item}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {activeProject ? `Give jar: ${activeProject.title}` : "No active cause selected yet."}
            </p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="h-11 rounded-full text-sm font-black"
            style={{ background: "var(--gold-cta)", color: "var(--bg-base)" }}
          >
            Go to Home
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="h-11 rounded-full text-sm font-black"
            style={{
              background: "rgba(237,245,240,0.08)",
              color: "var(--text-secondary)",
            }}
          >
            Close Tab
          </button>
        </div>
      </section>
    </div>
  );
}
