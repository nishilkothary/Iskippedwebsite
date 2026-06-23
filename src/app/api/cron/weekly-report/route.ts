import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { render } from "@react-email/components";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import WeeklyReport, { WeeklyReportProps } from "@/lib/emails/WeeklyReport";
import crypto from "crypto";
import * as React from "react";

export const maxDuration = 300;

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://iskipped.com";

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
  const noSkipPreview = new URL(req.url).searchParams.get("preview") === "noskip";

  // Fetch all users
  const usersSnap = await db.collection("users").get();
  let users = usersSnap.docs.map((d) => d.data());

  if (testMode) {
    users = users.filter((u) => u.email === "nkothary2@gmail.com");
  }

  let communityTotalSaved = 0;
  let communitySkipCount = 0;
  let communityUserCount = 0;
  const communityCategoryTotals: Record<string, { emoji: string; label: string; amount: number }> = {};

  type UserWeekData = {
    uid: string;
    email: string;
    displayName: string;
    weekSaved: number;
    skipCount: number;
    largestSkip: number;
    topCategories: { emoji: string; label: string; amount: number }[];
    causeAmount: number;
    liveAmount: number;
  };

  const BATCH = 10;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const eligible = users.filter(
    (u) => u.email && !u.weeklyEmailOptOut && u.lastSkipDate && u.lastSkipDate >= cutoffStr
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

        const skips = skipsSnap.docs.map((d) => d.data());
        const weekSaved = skips.reduce((s: number, sk: any) => s + (sk.amount ?? 0), 0);
        const skipCount = skips.length;

        const categoryTotals: Record<string, { emoji: string; label: string; amount: number }> = {};
        let causeAmount = 0;
        let liveAmount = 0;
        let largestSkip = 0;

        for (const sk of skips) {
          const amt = sk.amount ?? 0;
          const key = sk.category ?? sk.categoryLabel ?? "Other";
          if (!categoryTotals[key]) {
            categoryTotals[key] = { emoji: sk.categoryEmoji ?? "💰", label: sk.categoryLabel ?? key, amount: 0 };
          }
          categoryTotals[key].amount += amt;

          if (!communityCategoryTotals[key]) {
            communityCategoryTotals[key] = { emoji: sk.categoryEmoji ?? "💰", label: sk.categoryLabel ?? key, amount: 0 };
          }
          communityCategoryTotals[key].amount += amt;

          const give = sk.jarSplit?.give ?? (u.jarSplit?.give ?? 50);
          const live = sk.jarSplit?.live ?? (u.jarSplit?.live ?? 50);
          causeAmount += amt * (give / 100);
          liveAmount += amt * (live / 100);
          if (amt > largestSkip) largestSkip = amt;
        }

        const topCategories = Object.values(categoryTotals)
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3);

        communityTotalSaved += weekSaved;
        communitySkipCount += skipCount;
        communityUserCount += 1;

        return { uid: u.uid, email: u.email, displayName: u.displayName ?? "there", weekSaved, skipCount, largestSkip, topCategories, causeAmount, liveAmount };
      })
    );
    for (const r of results) {
      if (r) userWeekData.push(r);
    }
  }

  const communityTopCategory =
    Object.values(communityCategoryTotals).sort((a, b) => b.amount - a.amount)[0] ?? null;

  // Send emails
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < userWeekData.length; i += BATCH) {
    const batch = userWeekData.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (data) => {
        const profile = eligible.find((u) => u.uid === data.uid);
        if (!profile) return;

        // Cause name + totals from activeProjectId
        let causeName: string | null = profile.activeCauseTitle ?? null;
        let causeTotalRaised: number | null = null;
        let causeGoalAmount: number | null = null;
        if (profile.activeProjectId) {
          try {
            const projDoc = await db.collection("projects").doc(profile.activeProjectId).get();
            const proj = projDoc.data();
            if (proj) {
              causeName = causeName ?? proj.title ?? null;
              causeTotalRaised = proj.totalRaised ?? proj.totalDonated ?? null;
              causeGoalAmount = proj.goalAmount ?? null;
            }
          } catch {
            // ignore
          }
        }

        const props: WeeklyReportProps = {
          displayName: data.displayName,
          weekLabel: week.label,
          totalSaved: noSkipPreview ? 0 : data.weekSaved,
          skipCount: noSkipPreview ? 0 : data.skipCount,
          largestSkip: noSkipPreview ? 0 : data.largestSkip,
          averageSkip: noSkipPreview ? 0 : (data.skipCount > 0 ? data.weekSaved / data.skipCount : 0),
          topCategories: noSkipPreview ? [] : data.topCategories,
          streak: profile.streak ?? 0,
          causeName,
          causeAmount: data.causeAmount,
          liveAmount: data.liveAmount,
          causeImpactText: null,
          causeTotalRaised,
          causeGoalAmount,
          communityTotalSaved,
          communitySkipCount,
          communityTopCategory,
          groupName: null,
          unsubscribeUrl: getUnsubscribeUrl(data.uid),
          appUrl: APP_URL,
        };

        try {
          const html = await render(React.createElement(WeeklyReport, props));
          await resend.emails.send({
            from: "iSkipped <hello@iskipped.com>",
            to: data.email,
            subject: `Your iSkipped savings report — ${week.label}`,
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
