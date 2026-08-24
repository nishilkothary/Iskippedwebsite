import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { validateAmount, validateNonEmptyString } from "@/lib/services/serverProfileDefaults";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { SkipAllocationTarget, UserProfile } from "@/lib/types/models";
import { balancesFromLots, cloneLots, locationKey, transferLots } from "@/lib/utils/skipLedger";

function parseTarget(raw: unknown): SkipAllocationTarget {
  if (!raw || typeof raw !== "object") throw new ApiError(400, "Missing allocation target");
  const data = raw as Record<string, unknown>;
  const type = data.type === "goal" || data.type === "fundraiser" ? data.type : null;
  const id = validateNonEmptyString(data.id, "target.id");
  if (!type) throw new ApiError(400, "Invalid allocation target type");
  return { type, id };
}

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();
    const target = parseTarget(body.target);
    const amount = validateAmount(body.amount);
    const makeActive = body.makeActive !== false;

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);

    const appliedAmount = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new ApiError(404, "User not found");
      const profile = userSnap.data() as UserProfile;
      const skipLots = cloneLots(profile);
      const availableSkipBank = getSkipBalanceSummary(profile).unassignedSkipBank;
      const amountToApply = Math.min(amount, availableSkipBank);
      if (amountToApply <= 0) return 0;

      transferLots(skipLots, amountToApply, ["unassigned"], locationKey(target));
      const nextBalances = balancesFromLots(skipLots);

      const updates: Record<string, unknown> = {};
      if (target.type === "goal") {
        const currentBalance = Math.max(0, profile.goalJarBalances?.[target.id] ?? 0);
        updates.goalJarBalances = nextBalances.goalJarBalances;
      }
      if (target.type === "fundraiser") {
        const currentBalance = Math.max(0, profile.causeJarBalances?.[target.id] ?? 0);
        updates.causeJarBalances = nextBalances.causeJarBalances;
      }
      if (makeActive) {
        updates.activeSkipTarget = target;
        updates.activeProjectId = target.type === "fundraiser" ? target.id : null;
        updates.activeSpendingGoalId = target.type === "goal" ? target.id : null;
      }
      updates.skipLots = skipLots;
      if (target.type === "fundraiser") {
        tx.set(db.collection("projects").doc(target.id), { totalRaised: FieldValue.increment(amountToApply) }, { merge: true });
      }
      tx.update(userRef, updates);
      return amountToApply;
    });

    return NextResponse.json({ appliedAmount });
  } catch (e) {
    return handleApiError(e);
  }
}
