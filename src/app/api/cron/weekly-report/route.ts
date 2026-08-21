import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { render } from "@react-email/components";
import { getAdminDb, getAdminRtdb } from "@/lib/services/firebaseAdmin";
import WeeklyReport, { WeeklyReportProps } from "@/lib/emails/WeeklyReport";
import { formatUnits, oneUnitPhrase } from "@/lib/utils/impact";
import { getConsecutiveWeeklyStreak } from "@/lib/utils/dates";
import crypto from "crypto";
import * as React from "react";

export const maxDuration = 300;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://iskipped.com";

type ProjectImpactDetails = {
  title: string;
  unitName?: string | null;
  unitCost?: number | null;
  unitIsGoal?: boolean | null;
  unitPhrase?: string | null;
};

const OFFICIAL_PROJECT_IMPACT: Record<string, ProjectImpactDetails> = {
  cfc: {
    title: "Educate Cambodia's Children",
    unitName: "Day of Education",
    unitCost: 300 / 365,
  },
  kc: {
    title: "Laptops for Students in Kenya",
    unitName: "Laptop",
    unitCost: 250,
    unitIsGoal: true,
    unitPhrase: "a laptop for a student in a remote Kenyan village",
  },
  "pop-education": {
    title: "Pencils for Promise",
    unitName: "Day of Education",
    unitCost: 0.27,
  },
  "new-incentives": {
    title: "Child Vaccination in Nigeria",
    unitName: "Child Vaccination Program",
    unitCost: 16,
    unitIsGoal: true,
  },
};

function dollars(n: number) {
  return `$${n.toFixed(2).replace(/\.00$/, "")}`;
}

function firstName(displayName?: string | null) {
  return displayName?.trim().split(/\s+/)[0] || "";
}

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
    label: `${fmt(lastMonday)} - ${fmt(lastSunday)}`,
  };
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getUnsubscribeUrl(uid: string): string {
  const token = crypto
    .createHmac("sha256", process.env.CRON_SECRET ?? "")
    .update(uid)
    .digest("hex");
  return `${APP_URL}/api/unsubscribe?uid=${uid}&token=${token}`;
}

function formatCauseImpact(
  amount: number,
  causeName: string | null,
  project: ProjectImpactDetails | null
): string | null {
  if (amount <= 0) return null;

  const unitName = project?.unitName;
  const unitCost = project?.unitCost;
  if (unitName && unitCost && unitCost > 0) {
    if (project?.unitIsGoal) {
      const pct = (amount / unitCost) * 100;
      const pctText = pct >= 10 ? `${Math.round(pct)}` : `${parseFloat(pct.toFixed(1))}`;
      const phrase = project.unitPhrase ?? oneUnitPhrase(unitName);
      return `${pctText}% of ${phrase} pledged`;
    }
    return `${formatUnits(amount, unitCost, unitName)} pledged`;
  }

  return causeName ? `${dollars(amount)} pledged` : null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const db = getAdminDb();
  const week = getWeekRange();
  const testMode = new URL(req.url).searchParams.get("test") === "true";
  const noSkipPreview = new URL(req.url).searchParams.get("preview") === "noskip";

  const usersSnap = await db.collection("users").get();
  const allUsers = usersSnap.docs.map((d) => d.data());
  let users = allUsers;

  if (testMode) {
    users = users.filter((u) => u.email === "nkothary2@gmail.com");
  }

  const globalStatsSnap = await getAdminRtdb().ref("globalStats").get().catch(() => null);
  const globalStats = globalStatsSnap?.exists() ? globalStatsSnap.val() : null;
  const communityTotalSaved =
    typeof globalStats?.totalSaved === "number"
      ? globalStats.totalSaved
      : allUsers.reduce((sum: number, u) => sum + (u.totalSaved ?? 0), 0);
  const communitySkipCount =
    typeof globalStats?.totalSkips === "number"
      ? globalStats.totalSkips
      : allUsers.reduce((sum: number, u) => sum + (u.totalSkips ?? 0), 0);

  type UserWeekData = {
    uid: string;
    email: string;
    weekSaved: number;
    skipCount: number;
    causeAmount: number;
    endedStreakWeeks: number | null;
  };

  const BATCH = 10;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 42);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const streakHistoryCutoff = new Date();
  streakHistoryCutoff.setUTCDate(streakHistoryCutoff.getUTCDate() - 370);
  const streakHistoryCutoffStr = streakHistoryCutoff.toISOString().slice(0, 10);

  const eligible = users.filter(
    (u) =>
      u.email &&
      !u.weeklyEmailOptOut &&
      u.lastSkipDate &&
      u.lastSkipDate >= cutoffStr &&
      u.emailVerified !== false
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

        const weekSkips = skipsSnap.docs.map((d) => d.data());
        const historySnap = await db
          .collection("users")
          .doc(u.uid)
          .collection("skips")
          .where("date", ">=", streakHistoryCutoffStr)
          .where("date", "<", week.start)
          .get();
        const historySkips = historySnap.docs.map((d) => d.data());
        const allRecentDates = [...weekSkips, ...historySkips].map((sk: any) => sk.date);
        const weekSaved = weekSkips.reduce((s: number, sk: any) => s + (sk.amount ?? 0), 0);
        const skipCount = weekSkips.length;
        const endedStreakWeeks = skipCount === 0
          ? getConsecutiveWeeklyStreak(allRecentDates, addDays(week.start, -1))
          : 0;
        const causeAmount = weekSkips.reduce((sum: number, sk: any) => {
          const isFundraiserSkip = sk.allocationTarget?.type === "fundraiser" || Boolean(sk.projectId);
          return isFundraiserSkip ? sum + (sk.amount ?? 0) : sum;
        }, 0);

        return {
          uid: u.uid,
          email: u.email,
          weekSaved,
          skipCount,
          causeAmount,
          endedStreakWeeks: endedStreakWeeks > 0 ? endedStreakWeeks : null,
        };
      })
    );
    for (const r of results) {
      if (r) userWeekData.push(r);
    }
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < userWeekData.length; i += BATCH) {
    const batch = userWeekData.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (data) => {
        const profile = eligible.find((u) => u.uid === data.uid);
        if (!profile) return;

        let causeName: string | null = profile.activeCauseTitle ?? null;
        let projectImpact: ProjectImpactDetails | null =
          profile.activeProjectId ? OFFICIAL_PROJECT_IMPACT[profile.activeProjectId] ?? null : null;
        causeName = causeName ?? projectImpact?.title ?? null;
        if (profile.activeProjectId) {
          try {
            const projDoc = await db.collection("projects").doc(profile.activeProjectId).get();
            const proj = projDoc.data();
            if (proj) {
              causeName = causeName ?? proj.groupName ?? proj.title ?? null;
              projectImpact = {
                title: causeName ?? proj.groupName ?? proj.title ?? projectImpact?.title ?? "Cause",
                unitName: proj.unitName ?? projectImpact?.unitName ?? null,
                unitCost: proj.unitCost ?? projectImpact?.unitCost ?? null,
                unitIsGoal: proj.unitIsGoal ?? projectImpact?.unitIsGoal ?? null,
                unitPhrase: proj.unitPhrase ?? projectImpact?.unitPhrase ?? null,
              };
            }
          } catch {
            // Ignore missing cause details; the template can still show dollars pledged.
          }
        }

        const causeAmount = noSkipPreview ? 0 : data.causeAmount;
        const props: WeeklyReportProps = {
          displayName: profile.displayName ?? null,
          weekLabel: week.label,
          totalSaved: noSkipPreview ? 0 : data.weekSaved,
          skipCount: noSkipPreview ? 0 : data.skipCount,
          causeAmount,
          streak: profile.streak ?? 0,
          endedStreakWeeks: noSkipPreview ? 3 : data.endedStreakWeeks,
          causeName,
          causeImpactText: formatCauseImpact(causeAmount, causeName, projectImpact),
          communityTotalSaved,
          communitySkipCount,
          unsubscribeUrl: getUnsubscribeUrl(data.uid),
          appUrl: APP_URL,
        };

        try {
          const html = await render(React.createElement(WeeklyReport, props));
          const name = firstName(profile.displayName);
          await resend.emails.send({
            from: "iSkipped <hello@iskipped.com>",
            to: data.email,
            subject: name ? `Hey ${name}, did you skip anything this week?` : "Did you skip anything this week?",
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
