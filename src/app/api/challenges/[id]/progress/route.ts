import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/services/firebaseAdmin";
import { getChallengeTotals } from "@/lib/services/challengeTotals";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await getAdminAuth().verifyIdToken(idToken);
    const { id: challengeId } = await context.params;
    if (!challengeId) return NextResponse.json({ error: "Challenge id is required" }, { status: 400 });

    const db = getAdminDb();
    const projectSnap = await db.collection("projects").doc(challengeId).get();
    if (!projectSnap.exists) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

    const project = projectSnap.data() ?? {};
    const totals = await getChallengeTotals(db, challengeId, typeof project.title === "string" ? project.title : "", project.previousTitles);
    const members = Array.isArray(project.memberUids)
      ? project.memberUids.filter((uid: unknown): uid is string => typeof uid === "string" && uid.length > 0)
      : [];

    return NextResponse.json({
      totalPledged: totals.totalPledged,
      totalDonated: totals.totalDonated,
      contributorCount: members.length,
      // Pledged and completed donations are separate buckets. Pledged is the
      // current money still held in users' fundraiser jars.
      total: totals.total,
    });
  } catch (error) {
    console.error("[challenge progress] failed", error);
    return NextResponse.json({ error: "Unable to load challenge progress" }, { status: 500 });
  }
}
