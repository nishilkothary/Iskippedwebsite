import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { balancesFromLots, cloneLots, locationKey, transferLots } from "@/lib/utils/skipLedger";
import { UserProfile } from "@/lib/types/models";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const uid = await requireUid(req);
    const { id } = await context.params;
    if (!id) throw new ApiError(400, "Fundraiser id is required");

    const db = getAdminDb();
    const projectRef = db.collection("projects").doc(id);
    const [projectSnap, joinedSnap, activeSnap, balanceSnap] = await Promise.all([
      projectRef.get(),
      db.collection("users").where("joinedProjectIds", "array-contains", id).get(),
      db.collection("users").where("activeProjectId", "==", id).get(),
      db.collection("users").where(`causeJarBalances.${id}`, ">", 0).get(),
    ]);
    if (!projectSnap.exists) throw new ApiError(404, "Fundraiser not found");
    if (projectSnap.data()?.createdBy !== uid) throw new ApiError(403, "Only the fundraiser creator can delete it");

    const userIds = new Set([
      ...joinedSnap.docs.map((snap) => snap.id),
      ...activeSnap.docs.map((snap) => snap.id),
      ...balanceSnap.docs.map((snap) => snap.id),
    ]);
    const userRefs = Array.from(userIds).map((userId) => db.collection("users").doc(userId));
    const userSnaps = userRefs.length > 0 ? await db.getAll(...userRefs) : [];
    const title = String(projectSnap.data()?.title || projectSnap.data()?.groupName || "Fundraiser");

    await db.runTransaction(async (tx) => {
      const currentProject = await tx.get(projectRef);
      if (!currentProject.exists || currentProject.data()?.createdBy !== uid) {
        throw new ApiError(403, "Only the fundraiser creator can delete it");
      }
      for (const userSnap of userSnaps) {
        if (!userSnap.exists) continue;
        const profile = userSnap.data() as UserProfile;
        const amount = Math.max(0, Number(profile.causeJarBalances?.[id] ?? 0) || 0);
        const skipLots = cloneLots(profile);
        const updates: Record<string, unknown> = {};
        if (amount > 0) {
          transferLots(skipLots, amount, [locationKey({ type: "fundraiser", id })], "unassigned");
          const nextBalances = balancesFromLots(skipLots);
          updates.causeJarBalances = nextBalances.causeJarBalances;
          updates.goalJarBalances = nextBalances.goalJarBalances;
          updates.skipLots = skipLots;
        }
        if (profile.activeProjectId === id) updates.activeProjectId = null;
        if (profile.activeSkipTarget?.type === "fundraiser" && profile.activeSkipTarget.id === id) updates.activeSkipTarget = null;
        if (amount > 0) {
          updates[`deletedFundraiserNotices.${id}`] = {
            title,
            amount,
            deletedAt: new Date(),
          };
        }
        if (Object.keys(updates).length > 0) tx.update(userSnap.ref, updates);
      }
      tx.delete(projectRef);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
