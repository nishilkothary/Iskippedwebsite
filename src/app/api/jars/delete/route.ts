import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { SkipAllocationTarget, UserProfile } from "@/lib/types/models";
import { balancesFromLots, cloneLots, locationKey, transferLots } from "@/lib/utils/skipLedger";
import { validateNonEmptyString } from "@/lib/services/serverProfileDefaults";

function parseTarget(raw: unknown): SkipAllocationTarget {
  if (!raw || typeof raw !== "object") throw new ApiError(400, "Missing jar target");
  const data = raw as Record<string, unknown>;
  const type = data.type === "goal" || data.type === "fundraiser" ? data.type : null;
  if (!type) throw new ApiError(400, "Invalid jar target type");
  return { type, id: validateNonEmptyString(data.id, "target.id") };
}

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const target = parseTarget((await req.json()).target);
    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);

    const deletedAmount = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new ApiError(404, "User not found");
      const profile = userSnap.data() as UserProfile;
      const projectSnap = target.type === "fundraiser"
        ? await tx.get(db.collection("projects").doc(target.id))
        : null;
      const currentBalance = target.type === "goal"
        ? Math.max(0, profile.goalJarBalances?.[target.id] ?? 0)
        : Math.max(0, profile.causeJarBalances?.[target.id] ?? 0);
      const skipLots = cloneLots(profile);
      const updates: Record<string, unknown> = {};

      if (currentBalance > 0) {
        transferLots(skipLots, currentBalance, [locationKey(target)], "unassigned");
        const nextBalances = balancesFromLots(skipLots);
        updates.causeJarBalances = nextBalances.causeJarBalances;
        updates.goalJarBalances = nextBalances.goalJarBalances;
        updates.skipLots = skipLots;
        if (target.type === "fundraiser" && projectSnap?.exists) {
          tx.set(db.collection("projects").doc(target.id), { totalRaised: FieldValue.increment(-currentBalance) }, { merge: true });
        }
      }

      if (profile.activeSkipTarget?.type === target.type && profile.activeSkipTarget.id === target.id) {
        updates.activeSkipTarget = null;
      }
      if (target.type === "fundraiser") {
        if (profile.activeProjectId === target.id) updates.activeProjectId = null;
        updates.joinedProjectIds = FieldValue.arrayRemove(target.id);
      } else {
        if (profile.activeSpendingGoalId === target.id) updates.activeSpendingGoalId = null;
        updates.spendingGoals = (profile.spendingGoals ?? []).filter((goal) => goal.id !== target.id);
        if (profile.spendingGoal) updates.spendingGoal = null;
      }
      updates.parkedSkipTargets = (profile.parkedSkipTargets ?? []).filter(
        (parked) => parked.type !== target.type || parked.id !== target.id,
      );

      tx.update(userRef, updates);
      return currentBalance;
    });

    return NextResponse.json({ deletedAmount });
  } catch (error) {
    return handleApiError(error);
  }
}
