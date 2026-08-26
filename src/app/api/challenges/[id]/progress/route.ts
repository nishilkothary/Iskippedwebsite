import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/services/firebaseAdmin";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await getAdminAuth().verifyIdToken(idToken);
    const { id: challengeId } = await context.params;
    if (!challengeId) return NextResponse.json({ error: "Challenge id is required" }, { status: 400 });

    // The project document is the aggregate source of truth. The previous
    // endpoint scanned every user's historical skips and donations (and wrote
    // feed repairs) for each card on Jars, which exhausted Firestore quota.
    const projectSnap = await getAdminDb().collection("projects").doc(challengeId).get();
    if (!projectSnap.exists) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

    const project = projectSnap.data() ?? {};
    const totalRaised = typeof project.totalRaised === "number" ? Math.max(0, project.totalRaised) : 0;
    const totalDonated = typeof project.totalDonated === "number" ? Math.max(0, project.totalDonated) : 0;
    const members = Array.isArray(project.memberUids)
      ? project.memberUids.filter((uid: unknown): uid is string => typeof uid === "string" && uid.length > 0)
      : [];

    return NextResponse.json({
      totalPledged: totalRaised,
      totalDonated,
      contributorCount: members.length,
      total: Math.max(totalRaised, totalDonated),
    });
  } catch (error) {
    console.error("[challenge progress] failed", error);
    return NextResponse.json({ error: "Unable to load challenge progress" }, { status: 500 });
  }
}
