import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { getChallengeTotals } from "@/lib/services/challengeTotals";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Challenge id is required" }, { status: 400 });

  try {
    const db = getAdminDb();
    const projectSnap = await db.collection("projects").doc(id).get();
    if (!projectSnap.exists) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    const project = projectSnap.data() ?? {};
    const totals = await getChallengeTotals(db, id, typeof project.title === "string" ? project.title : undefined);
    return NextResponse.json(totals);
  } catch (error) {
    console.error("[public challenge totals] failed", error);
    return NextResponse.json({ error: "Unable to load challenge totals" }, { status: 500 });
  }
}
