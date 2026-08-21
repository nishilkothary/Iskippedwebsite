import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { validateNonEmptyString } from "@/lib/services/serverProfileDefaults";
import { SkipAllocationTarget, UserProfile } from "@/lib/types/models";

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
    const clearActive = body.clearActive !== false;

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);

    const releasedAmount = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new ApiError(404, "User not found");
      const profile = userSnap.data() as UserProfile;
      const currentBalance = target.type === "goal"
        ? Math.max(0, profile.goalJarBalances?.[target.id] ?? 0)
        : Math.max(0, profile.causeJarBalances?.[target.id] ?? 0);
      const releasedAmount = Math.max(0, currentBalance);
      if (releasedAmount <= 0 && !clearActive) return 0;

      const updates: Record<string, unknown> = {};
      if (releasedAmount > 0 && target.type === "goal") updates[`goalJarBalances.${target.id}`] = 0;
      if (releasedAmount > 0 && target.type === "fundraiser") updates[`causeJarBalances.${target.id}`] = 0;
      if (clearActive && profile.activeSkipTarget?.type === target.type && profile.activeSkipTarget.id === target.id) {
        updates.activeSkipTarget = null;
      }
      if (Object.keys(updates).length > 0) tx.update(userRef, updates);
      return releasedAmount;
    });

    return NextResponse.json({ releasedAmount });
  } catch (e) {
    return handleApiError(e);
  }
}
