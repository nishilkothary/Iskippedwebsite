"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/services/firebase/config";
import { Project } from "@/lib/types/models";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";
import type { Timestamp } from "firebase/firestore";

function daysLeft(endDate: Timestamp | null | undefined): number | null {
  if (!endDate) return null;
  const ms = endDate.toDate().getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function ProgressBar({ raised, goal }: { raised: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.7)" }}>
        <span>${raised.toLocaleString()} raised</span>
        <span>{pct}% of ${goal.toLocaleString()} goal</span>
      </div>
      <div className="h-2.5 rounded-full bg-white/20 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: "linear-gradient(90deg, #2ECC71, #34A87A)" }}
        />
      </div>
    </div>
  );
}

export default function JoinChallengePage() {
  const router = useRouter();
  const params = useParams();
  const challengeId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const { user, isLoading: authLoading } = useAuthStore();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Redirect signed-in users straight to the authenticated challenge page
  useEffect(() => {
    if (!authLoading && user) router.replace(`/challenges/${challengeId}`);
  }, [user, authLoading, challengeId, router]);

  useEffect(() => {
    if (!challengeId) { setNotFound(true); setLoading(false); return; }
    getDoc(doc(db, "projects", challengeId))
      .then((snap) => {
        if (snap.exists()) {
          setProject({ id: snap.id, ...snap.data() } as Project);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [challengeId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f3d2a] via-[#1a5c42] to-[#2d8b6a]">
        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-[#0f3d2a] via-[#1a5c42] to-[#2d8b6a] px-6 text-center">
        <p className="text-3xl font-black text-white">i<span className="text-[#2ECC71]">skipped</span></p>
        <p className="text-white/80 text-lg">This challenge couldn&apos;t be found.</p>
        <Link
          href="/sign-in"
          className="mt-2 px-6 py-3 bg-[#2ECC71] text-white font-bold rounded-xl hover:opacity-90 transition"
        >
          Go to iSkipped
        </Link>
      </div>
    );
  }

  const participants = project.memberUids?.length ?? 0;
  const remaining = daysLeft(project.endDate as Timestamp | null);
  const hasGoal = (project.goalAmount ?? 0) > 0;
  const signUpHref = `/sign-in?mode=signup&redirect=/challenges/${challengeId}`;
  const signInHref = `/sign-in?mode=signin&redirect=/challenges/${challengeId}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f3d2a] via-[#1a5c42] to-[#2d8b6a] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/sign-in" className="text-xl font-black text-white tracking-tight">
          i<span className="text-[#2ECC71]">skipped</span>
        </Link>
        <Link
          href={signInHref}
          className="text-sm font-semibold text-white/80 hover:text-white transition"
        >
          Sign In
        </Link>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-6 pb-10">
        <div className="w-full max-w-md">
          {/* Hero image */}
          {project.imageURL ? (
            <div className="w-full h-52 rounded-2xl overflow-hidden mb-5 shadow-xl">
              <img
                src={project.imageURL}
                alt={project.title}
                className="w-full h-full object-cover"
                style={project.imagePosition ? { objectPosition: project.imagePosition } : undefined}
              />
            </div>
          ) : (
            <div
              className="w-full h-52 rounded-2xl mb-5 shadow-xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.12)" }}
            >
              <span className="text-6xl">🏆</span>
            </div>
          )}

          {/* Title & organizer */}
          <h1 className="text-2xl font-black text-white leading-tight mb-1">{project.title}</h1>
          {project.sponsor && (
            <p className="text-sm text-white/60 mb-4">by {project.sponsor}</p>
          )}

          {/* Stats row */}
          <div className="flex gap-3 mb-5">
            <div className="flex-1 bg-white/10 rounded-xl px-3 py-3 text-center">
              <p className="text-lg font-black text-white">{participants}</p>
              <p className="text-[11px] text-white/60 font-medium mt-0.5">
                {participants === 1 ? "member" : "members"}
              </p>
            </div>
            {hasGoal && (
              <div className="flex-1 bg-white/10 rounded-xl px-3 py-3 text-center">
                <p className="text-lg font-black text-white">${(project.totalRaised ?? 0).toLocaleString()}</p>
                <p className="text-[11px] text-white/60 font-medium mt-0.5">raised</p>
              </div>
            )}
            {remaining !== null && (
              <div className="flex-1 bg-white/10 rounded-xl px-3 py-3 text-center">
                <p className="text-lg font-black text-white">{remaining}</p>
                <p className="text-[11px] text-white/60 font-medium mt-0.5">
                  {remaining === 1 ? "day left" : "days left"}
                </p>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {hasGoal && (
            <div className="mb-5">
              <ProgressBar raised={project.totalRaised ?? 0} goal={project.goalAmount} />
            </div>
          )}

          {/* Description */}
          {project.description && (
            <p className="text-sm text-white/75 leading-relaxed mb-6">{project.description}</p>
          )}

          {/* CTAs */}
          <div className="space-y-3">
            <Link
              href={signUpHref}
              className="block w-full text-center px-6 py-4 rounded-2xl font-bold text-base text-white shadow-lg transition hover:opacity-90 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #2ECC71, #34A87A)" }}
            >
              Join this Challenge
            </Link>
            <p className="text-center text-sm text-white/60">
              Already on iSkipped?{" "}
              <Link href={signInHref} className="text-white font-semibold hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
