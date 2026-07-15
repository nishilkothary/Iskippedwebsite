import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { sendPushToUser } from "@/lib/services/push";
import { yesterday, startOfWeek } from "@/lib/utils/dates";

export const maxDuration = 300;

const BATCH = 10;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yesterdayStr = yesterday();
  const weekStartStr = startOfWeek();
  const dayOfWeek = new Date().getDay(); // 0=Sun, 3=Wed (server runs in UTC on Vercel)
  // Goal is at least one skip a week: nudge midweek (Wed) and again as a last chance (Sun),
  // for anyone who hasn't logged a skip since Monday.
  const isWeeklyNudgeDay = dayOfWeek === 3 || dayOfWeek === 0;
  const isLastChance = dayOfWeek === 0;

  const db = getAdminDb();
  const snap = await db.collection("users").where("pushOptIn", "==", true).get();
  const users = snap.docs.map((d) => d.data());

  let streakReminders = 0;
  let weeklyNudges = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (u) => {
        if (!u.fcmTokens?.length) return;
        try {
          if (u.lastSkipDate === yesterdayStr && (u.streak ?? 0) > 0) {
            await sendPushToUser(u.uid, {
              title: "🔥 Your streak is at risk!",
              body: `You're on a ${u.streak}-day streak — log a skip today before it resets.`,
              url: "/home",
            });
            streakReminders++;
          } else if (isWeeklyNudgeDay && (!u.lastSkipDate || u.lastSkipDate < weekStartStr)) {
            await sendPushToUser(u.uid, {
              title: isLastChance ? "⏰ Last chance this week" : "👋 Haven't skipped yet this week?",
              body: isLastChance
                ? "You haven't logged a skip this week — there's still time today."
                : "A small skip today still counts toward your goals.",
              url: "/home",
            });
            weeklyNudges++;
          }
        } catch {
          failed++;
        }
      })
    );
  }

  return NextResponse.json({ checked: users.length, streakReminders, weeklyNudges, failed });
}
