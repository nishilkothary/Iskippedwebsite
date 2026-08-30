import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { sendPushToUser } from "@/lib/services/push";

export const maxDuration = 300;

const BATCH = 10;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dayOfWeek = new Date().getDay(); // 0=Sun (server runs in UTC on Vercel)
  const isWeeklyReminderDay = dayOfWeek === 0;

  const db = getAdminDb();
  const snap = await db.collection("users").where("pushOptIn", "==", true).get();
  const users = snap.docs.map((d) => d.data());

  let weeklyNudges = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (u) => {
        if (!u.fcmTokens?.length) return;
        try {
          if (!isWeeklyReminderDay) return;
          await sendPushToUser(u.uid, {
            title: "Did you skip anything this week?",
            body: "Don’t forget to log your skips and watch your savings grow.",
            url: "/home",
          });
          weeklyNudges++;
        } catch {
          failed++;
        }
      })
    );
  }

  return NextResponse.json({ checked: users.length, weeklyNudges, failed });
}
