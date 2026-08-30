import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/services/firebaseAdmin";
import { getChallengeTotals } from "@/lib/services/challengeTotals";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await context.params;
  if (!projectId) return NextResponse.json({ error: "Fundraiser id is required" }, { status: 400 });

  try {
    const db = getAdminDb();
    const projectSnap = await db.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) return NextResponse.json({ error: "Fundraiser not found" }, { status: 404 });

    const project = projectSnap.data() ?? {};
    // Aggregate totals are already shown on group cards to authenticated
    // participants. Keep member identities/details behind the separate
    // owner/admin members endpoint, but do not let stale memberUids or a
    // private/unlisted visibility flag turn a valid group total into $0 in
    // the card.

    const totals = await getChallengeTotals(db, projectId, typeof project.title === "string" ? project.title : "", project.previousTitles);

    return NextResponse.json({
      totalPledged: totals.totalPledged,
      totalDonated: totals.totalDonated,
      total: totals.total,
    });
  } catch (error) {
    console.error("[challenge totals] failed", error);
    return NextResponse.json({ error: "Unable to load fundraiser totals" }, { status: 500 });
  }
}
