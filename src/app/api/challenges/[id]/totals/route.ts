import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/services/firebaseAdmin";
import { DESIGNATED_ADMIN_EMAIL } from "@/lib/constants/admin";
import { getChallengeTotals } from "@/lib/services/challengeTotals";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  let email: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    uid = decoded.uid;
    email = (decoded.email ?? "").trim().toLowerCase();
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
    const memberUids = Array.isArray(project.memberUids) ? project.memberUids : [];
    const restricted = project.visibility === "private"
      || project.visibility === "password"
      || project.tags?.includes?.("visibility-private")
      || project.tags?.includes?.("visibility-unlisted");
    const isDesignatedAdmin = email === DESIGNATED_ADMIN_EMAIL;
    if (restricted && !isDesignatedAdmin && project.createdBy !== uid && !memberUids.includes(uid)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const totals = await getChallengeTotals(db, projectId, typeof project.title === "string" ? project.title : "");

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
