import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import {
  getCachedChallengeTotals,
  PUBLIC_CHALLENGE_TOTALS_CACHE_CONTROL,
} from "@/lib/services/cachedChallengeTotals";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Challenge id is required" }, { status: 400 });

  try {
    const db = getAdminDb();
    const projectSnap = await db.collection("projects").doc(id).get();
    if (!projectSnap.exists) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    const project = projectSnap.data() ?? {};
    const totals = await getCachedChallengeTotals(
      id,
      typeof project.title === "string" ? project.title : undefined,
      project.previousTitles,
    );
    return NextResponse.json(totals, {
      headers: { "Cache-Control": PUBLIC_CHALLENGE_TOTALS_CACHE_CONTROL },
    });
  } catch (error) {
    console.error("[public challenge totals] failed", error);
    return NextResponse.json({ error: "Unable to load challenge totals" }, { status: 500 });
  }
}
