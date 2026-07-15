import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { normalizeJarSplitServer } from "@/lib/services/serverProfileDefaults";
import { UserProfile, Project } from "@/lib/types/models";

// Everything the extension's checkout overlay needs, in one call.
// CONTRACT: fields may be added here, but never renamed or removed —
// installed extensions can only be updated through a Chrome Web Store
// review cycle. Map internal model changes to this shape instead.
export async function GET(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const db = getAdminDb();

    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) throw new ApiError(404, "User not found");
    const profile = userSnap.data() as UserProfile;

    let activeProject: {
      id: string;
      title: string;
      location: string | null;
      unitName: string | null;
      unitCost: number | null;
      unitIsGoal: boolean;
    } | null = null;

    if (profile.activeProjectId) {
      const projSnap = await db.collection("projects").doc(profile.activeProjectId).get();
      if (projSnap.exists) {
        const p = projSnap.data() as Project;
        activeProject = {
          id: projSnap.id,
          title: p.title,
          location: p.location ?? null,
          unitName: p.unitName ?? null,
          unitCost: p.unitCost ?? null,
          unitIsGoal: p.unitIsGoal === true,
        };
      }
    }

    return NextResponse.json({
      displayName: profile.displayName || "Skipper",
      photoURL: profile.photoURL ?? null,
      jarSplit: normalizeJarSplitServer(profile.jarSplit),
      totalSaved: profile.totalSaved ?? 0,
      streak: profile.streak ?? 0,
      activeProject,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
