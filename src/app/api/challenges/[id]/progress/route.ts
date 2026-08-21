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
    const projectRef = db.collection("projects").doc(challengeId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

    const project = projectSnap.data() ?? {};
    const challengeTitle = typeof project.title === "string" ? project.title : "";

    // Current impact is confirmed donations plus money still held in members' cause jars.
    const balanceUsersSnap = await db.collection("users").where(`causeJarBalances.${challengeId}`, ">", 0).get();
    const totalPledged = balanceUsersSnap.docs.reduce((sum, userSnap) => {
      const balance = userSnap.data().causeJarBalances?.[challengeId];
      return sum + (typeof balance === "number" ? Math.max(0, balance) : 0);
    }, 0);
    const [causeDonations, titleDonations] = await Promise.all([
      db.collectionGroup("donations").where("causeId", "==", challengeId).get(),
      challengeTitle
        ? db.collectionGroup("donations").where("causeTitle", "==", challengeTitle).get()
        : Promise.resolve({ docs: [] }),
    ]);
    const donationDocs = new Map<string, typeof causeDonations.docs[number]>();
    for (const donation of [...causeDonations.docs, ...titleDonations.docs]) donationDocs.set(donation.ref.path, donation);
    const recordedDonations = [...donationDocs.values()].reduce((sum, donation) => {
      const amount = donation.get("amount");
      return sum + (typeof amount === "number" ? Math.max(0, amount) : 0);
    }, 0);
    const storedDonated = typeof project.totalDonated === "number" ? Math.max(0, project.totalDonated) : 0;
    const totalDonated = recordedDonations > 0 ? recordedDonations : storedDonated;

    return NextResponse.json({ totalPledged, totalDonated, total: totalPledged + totalDonated });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
