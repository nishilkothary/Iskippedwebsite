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

    const db = getAdminDb();
    const projectSnap = await db.collection("projects").doc(challengeId).get();
    if (!projectSnap.exists) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

    const project = projectSnap.data() ?? {};
    const title = typeof project.title === "string" ? project.title : "";
    const [jarUsers, causeDonations, titleDonations] = await Promise.all([
      db.collection("users").where(`causeJarBalances.${challengeId}`, ">", 0).get(),
      db.collectionGroup("donations").where("causeId", "==", challengeId).get(),
      title ? db.collectionGroup("donations").where("causeTitle", "==", title).get() : Promise.resolve({ docs: [] }),
    ]);
    const totalRaised = jarUsers.docs.reduce((sum, user) => {
      const amount = Number(user.data().causeJarBalances?.[challengeId] ?? 0);
      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0);
    const donations = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const donation of [...causeDonations.docs, ...titleDonations.docs]) donations.set(donation.ref.path, donation);
    const totalDonated = Array.from(donations.values()).reduce((sum, donation) => {
      const amount = Number(donation.get("amount") ?? 0);
      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0);
    const members = Array.isArray(project.memberUids)
      ? project.memberUids.filter((uid: unknown): uid is string => typeof uid === "string" && uid.length > 0)
      : [];

    return NextResponse.json({
      totalPledged: totalRaised,
      totalDonated,
      contributorCount: members.length,
      // Pledged and completed donations are separate buckets. Pledged is the
      // current money still held in users' fundraiser jars.
      total: totalRaised + totalDonated,
    });
  } catch (error) {
    console.error("[challenge progress] failed", error);
    return NextResponse.json({ error: "Unable to load challenge progress" }, { status: 500 });
  }
}
