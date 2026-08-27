import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/services/firebaseAdmin";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
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
    if (project.createdBy !== uid && !memberUids.includes(uid)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const title = typeof project.title === "string" ? project.title : "";
    const [jarUsers, causeDonations, titleDonations] = await Promise.all([
      db.collection("users").where(`causeJarBalances.${projectId}`, ">", 0).get(),
      db.collectionGroup("donations").where("causeId", "==", projectId).get(),
      title ? db.collectionGroup("donations").where("causeTitle", "==", title).get() : Promise.resolve({ docs: [] }),
    ]);

    const totalPledged = jarUsers.docs.reduce((sum, user) => {
      const amount = Number(user.data().causeJarBalances?.[projectId] ?? 0);
      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0);

    // Legacy records may only have causeTitle. Deduplicate records that have
    // both fields so a donation can never be counted twice.
    const donations = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const doc of [...causeDonations.docs, ...titleDonations.docs]) donations.set(doc.ref.path, doc);
    const totalDonated = Array.from(donations.values()).reduce((sum, donation) => {
      const amount = Number(donation.get("amount") ?? 0);
      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0);

    return NextResponse.json({
      totalPledged,
      totalDonated,
      total: totalPledged + totalDonated,
    });
  } catch (error) {
    console.error("[challenge totals] failed", error);
    return NextResponse.json({ error: "Unable to load fundraiser totals" }, { status: 500 });
  }
}
