import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { render } from "@react-email/components";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import WeeklyReport, { WeeklyReportProps } from "@/lib/emails/WeeklyReport";
import { levelForXp, xpForLevel } from "@/lib/utils/xp";
import crypto from "crypto";
import * as React from "react";

export const maxDuration = 300;

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://iskipped.app";

function getWeekRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMonday = new Date(now);
  lastMonday.setUTCDate(now.getUTCDate() - daysToLastMonday - 7);
  lastMonday.setUTCHours(0, 0, 0, 0);
  const lastSunday = new Date(lastMonday);
  lastSunday.setUTCDate(lastMonday.getUTCDate() + 6);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return {
    start: lastMonday.toISOString().slice(0, 10),
    end: lastSunday.toISOString().slice(0, 10),
    label: `${fmt(lastMonday)} – ${fmt(lastSunday)}`,
  };
}

function getUnsubscribeUrl(uid: string): string {
  const token = crypto
    .createHmac("sha256", process.env.CRON_SECRET ?? "")
    .update(uid)
    .digest("hex");
  return `${APP_URL}/api/unsubscribe?uid=${uid}&token=${token}`;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const week = getWeekRange();
  const testMode = new URL(req.url).searchParams.get("test") === "true";

  // Fetch all users
  const usersSnap = await db.collection("users").get();
  let users = usersSnap.docs.map((d) => d.data());

  if (testMode) {
    users = users.filter((u) => u.email === "nkothary2@gmail.com");
  }

  // Community totals — computed from skip sub-collections of users who skipped last week
  let communityTotalSaved = 0;
  let communitySkipCount = 0;
  let communityUserCount = 0;

  // Per-user weekly skip data
  type UserWeekData = {
    uid: string;
    email: string;
    displayName: string;
    weekSaved: number;
    skipCount: number;
    topCategories: { emoji: string; label: string; amount: number }[];
    xpEarned: number;
    causeAmount: number;
  };

  const BATCH = 10;
  const eligible = users.filter(
    (u) => u.email && !u.weeklyEmailOptOut
  );

  const userWeekData: UserWeekData[] = [];

  for (let i = 0; i < eligible.length; i += BATCH) {
    const batch = eligible.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (u) => {
        const skipsSnap = await db
          .collection("users")
          .doc(u.uid)
          .collection("skips")
          .where("date", ">=", week.start)
          .where("date", "<=", week.end)
          .get();

        if (skipsSnap.empty) return null;

        const skips = skipsSnap.docs.map((d) => d.data());
        const weekSaved = skips.reduce((s, sk) => s + (sk.amount ?? 0), 0);
        const skipCount = skips.length;

        const categoryTotals: Record<string, { emoji: string; label: string; amount: number }> = {};
        let causeAmount = 0;
        let xpEarned = 0;

        for (const sk of skips) {
          const key = sk.category ?? sk.categoryLabel ?? "Other";
          if (!categoryTotals[key]) {
            categoryTotals[key] = { emoji: sk.categoryEmoji ?? "💰", label: sk.categoryLabel ?? key, amount: 0 };
          }
          categoryTotals[key].amount += sk.amount ?? 0;
          const give = sk.jarSplit?.give ?? (u.jarSplit?.give ?? 50);
          causeAmount += (sk.amount ?? 0) * (give / 100);
          xpEarned += Math.floor((sk.amount ?? 0) * 2) + 10;
        }

        const topCategories = Object.values(categoryTotals)
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3);

        communityTotalSaved += weekSaved;
        communitySkipCount += skipCount;
        communityUserCount += 1;

        return { uid: u.uid, email: u.email, displayName: u.displayName ?? "there", weekSaved, skipCount, topCategories, xpEarned, causeAmount };
      })
    );
    for (const r of results) {
      if (r) userWeekData.push(r);
    }
  }

  // Send emails in batches
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < userWeekData.length; i += BATCH) {
    const batch = userWeekData.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (data) => {
        const profile = eligible.find((u) => u.uid === data.uid);
        if (!profile) return;

        const currentXp = profile.xp ?? 0;
        const priorXp = Math.max(0, currentXp - data.xpEarned);
        const currentLevel = levelForXp(currentXp);
        const priorLevel = levelForXp(priorXp);
        const xpIntoLevel = currentXp - xpForLevel(currentLevel);
        const xpForNextLevel = xpForLevel(currentLevel + 1) - xpForLevel(currentLevel);

        let streakChange: WeeklyReportProps["streakChange"] = "none";
        if (data.skipCount > 0) {
          const streak = profile.streak ?? 0;
          const longestStreak = profile.longestStreak ?? 0;
          if (streak >= longestStreak && streak > 1) streakChange = "new-record";
          else if (currentLevel > priorLevel) streakChange = "grew";
          else streakChange = "kept";
        }

        // Cause name from activeProjectId
        let causeName: string | null = profile.activeCauseTitle ?? null;
        if (!causeName && profile.activeProjectId) {
          try {
            const projDoc = await db.collection("projects").doc(profile.activeProjectId).get();
            causeName = projDoc.data()?.title ?? null;
          } catch {
            // ignore
          }
        }

        const props: WeeklyReportProps = {
          displayName: data.displayName,
          weekLabel: week.label,
          totalSaved: data.weekSaved,
          skipCount: data.skipCount,
          streak: profile.streak ?? 0,
          streakChange,
          xpEarned: data.xpEarned,
          currentLevel,
          xpIntoLevel,
          xpForNextLevel,
          topCategories: data.topCategories,
          causeName,
          causeAmount: data.causeAmount,
          causeImpactText: null,
          vsLastWeek: null,
          communityTotalSaved,
          communitySkipCount,
          communityUserCount,
          unsubscribeUrl: getUnsubscribeUrl(data.uid),
          appUrl: APP_URL,
        };

        try {
          const html = await render(React.createElement(WeeklyReport, props));
          await resend.emails.send({
            from: "iSkipped <hello@iskipped.com>",
            to: data.email,
            subject: `You saved $${data.weekSaved.toFixed(0)} last week 🔥 — your iSkipped recap`,
            html,
          });
          sent++;
        } catch {
          failed++;
        }
      })
    );
  }

  return NextResponse.json({ sent, failed, usersWithActivity: userWeekData.length, week: week.label });
}
