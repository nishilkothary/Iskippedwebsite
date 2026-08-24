import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { adjustGlobalStats } from "@/lib/services/globalStats";
import { UserProfile, Skip, SkipAllocationTarget } from "@/lib/types/models";
import { removeUnspentSkipValue } from "@/lib/utils/skipBalances";

type RouteContext = { params: Promise<{ skipId: string }> };

const EDITABLE_FIELDS = ["category", "categoryLabel", "categoryEmoji", "amount", "projectId", "projectTitle", "whatSkipped", "notes", "allocationTarget"] as const;

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const uid = await requireUid(req);
    const { skipId } = await ctx.params;
    const body = await req.json();
    const rawUpdates: Record<string, unknown> = typeof body.updates === "object" && body.updates ? body.updates : {};
    if (rawUpdates.amount !== undefined && (typeof rawUpdates.amount !== "number" || rawUpdates.amount <= 0 || rawUpdates.amount > 10000)) {
      throw new ApiError(400, "Invalid amount");
    }
    const updates: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      if (rawUpdates[key] !== undefined) updates[key] = rawUpdates[key];
    }

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const skipRef = userRef.collection("skips").doc(skipId);

    const { projectId, fundraiserAmountDelta, amountDelta, resolvedAmount, resolvedCategoryLabel, causeJarBalances, goalJarBalances } = await db.runTransaction(async (tx) => {
      const [skipSnap, userSnap] = await Promise.all([tx.get(skipRef), tx.get(userRef)]);
      if (!skipSnap.exists) throw new ApiError(404, "Skip not found");
      const skip = skipSnap.data() as Skip;
      const profile = userSnap.data() as UserProfile;

      const oldAmount = skip.amount;
      const newAmount = (updates.amount as number | undefined) ?? oldAmount;
      const amountDelta = newAmount - oldAmount;
      const allocationTarget = resolveSkipTarget(skip, updates.allocationTarget as SkipAllocationTarget | null | undefined);
      let reconciledBalances: { causeJarBalances: Record<string, number>; goalJarBalances: Record<string, number> } | null = null;
      if (amountDelta < 0) {
        try {
          reconciledBalances = removeUnspentSkipValue(profile, -amountDelta, allocationTarget, profile.activeSkipTarget);
        } catch (error) {
          throw new ApiError(409, error instanceof Error ? error.message : "This edit cannot be applied safely.");
        }
      }

      if (Object.keys(updates).length > 0) tx.update(skipRef, updates);

      const userUpdate: Record<string, unknown> = {};
      if (amountDelta !== 0) userUpdate.totalSaved = FieldValue.increment(amountDelta);
      if (reconciledBalances) {
        userUpdate.causeJarBalances = reconciledBalances.causeJarBalances;
        userUpdate.goalJarBalances = reconciledBalances.goalJarBalances;
      }
      if (amountDelta !== 0 && allocationTarget?.type === "fundraiser") {
        userUpdate.savedTowardActiveCause = Math.max(
          0,
          (profile.savedTowardActiveCause ?? 0) + amountDelta
        );
      }
      if (amountDelta !== 0 && allocationTarget?.type === "goal") {
        if (amountDelta > 0) userUpdate[`goalJarBalances.${allocationTarget.id}`] = Math.max(0, (profile.goalJarBalances?.[allocationTarget.id] ?? 0) + amountDelta);
      }
      if (amountDelta !== 0 && allocationTarget?.type === "fundraiser") {
        if (amountDelta > 0) userUpdate[`causeJarBalances.${allocationTarget.id}`] = Math.max(0, (profile.causeJarBalances?.[allocationTarget.id] ?? 0) + amountDelta);
      }
      if (Object.keys(userUpdate).length > 0) tx.update(userRef, userUpdate);

      return {
        projectId: allocationTarget?.type === "fundraiser" ? allocationTarget.id : null,
        fundraiserAmountDelta: allocationTarget?.type === "fundraiser" ? amountDelta : 0,
        amountDelta,
        resolvedAmount: newAmount,
        resolvedCategoryLabel: (updates.categoryLabel as string | undefined) ?? skip.categoryLabel,
        causeJarBalances: reconciledBalances?.causeJarBalances,
        goalJarBalances: reconciledBalances?.goalJarBalances,
      };
    });

    // Keep legacy project counters in sync, but UI progress is derived from donations plus jar balances.
    if (projectId && fundraiserAmountDelta !== 0) {
      const projectRef = db.collection("projects").doc(projectId);
      if (fundraiserAmountDelta > 0) {
        projectRef.update({ totalRaised: FieldValue.increment(fundraiserAmountDelta) })
          .catch((e) => console.warn("[skips] project totalRaised increment failed:", e));
      } else {
        projectRef.get()
          .then((snap) => {
            const current = (snap.data()?.totalRaised ?? 0) as number;
            return projectRef.update({ totalRaised: Math.max(0, current + fundraiserAmountDelta) });
          })
          .catch((e) => console.warn("[skips] project totalRaised decrement failed:", e));
      }
    }

    // Sync community feed message/amount if the amount changed (best-effort)
    if (amountDelta !== 0) {
      await adjustGlobalStats(amountDelta, 0);
      db.collection("communityFeed").doc(skipId).update({
        skipAmount: resolvedAmount,
        message: `skipped ${resolvedCategoryLabel} and saved $${resolvedAmount.toFixed(2)}`,
      }).catch(() => {});
    }

    return NextResponse.json({ causeJarBalances, goalJarBalances }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const uid = await requireUid(req);
    const { skipId } = await ctx.params;

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const skipRef = userRef.collection("skips").doc(skipId);

    const { projectId, fundraiserAmount, deletedAmount, causeJarBalances, goalJarBalances } = await db.runTransaction(async (tx) => {
      const [skipSnap, userSnap] = await Promise.all([tx.get(skipRef), tx.get(userRef)]);
      if (!skipSnap.exists) throw new ApiError(404, "Skip not found");
      const skip = skipSnap.data() as Skip;
      const profile = userSnap.data() as UserProfile;
      const allocationTarget = resolveSkipTarget(skip);
      let nextBalances;
      try {
        nextBalances = removeUnspentSkipValue(profile, skip.amount, allocationTarget, profile.activeSkipTarget);
      } catch (error) {
        throw new ApiError(409, error instanceof Error ? error.message : "This skip cannot be deleted safely.");
      }

      tx.delete(skipRef);
      const userUpdate: Record<string, unknown> = {
        totalSaved: FieldValue.increment(-skip.amount),
        totalSkips: FieldValue.increment(-1),
        savedTowardActiveCause: allocationTarget?.type === "fundraiser"
          ? Math.max(0, (profile.savedTowardActiveCause ?? 0) - skip.amount)
          : (profile.savedTowardActiveCause ?? 0),
        // A jar is an aggregate balance. Reconcile from the current fungible
        // balance, not by blindly subtracting from the skip's old target.
        causeJarBalances: nextBalances.causeJarBalances,
        goalJarBalances: nextBalances.goalJarBalances,
      };
      tx.update(userRef, userUpdate);

      return {
        projectId: allocationTarget?.type === "fundraiser" ? allocationTarget.id : null,
        fundraiserAmount: allocationTarget?.type === "fundraiser" ? skip.amount : 0,
        deletedAmount: skip.amount,
        causeJarBalances: nextBalances.causeJarBalances,
        goalJarBalances: nextBalances.goalJarBalances,
      };
    });

    await adjustGlobalStats(-deletedAmount, -1);

    db.collection("communityFeed").doc(skipId).delete().catch(() => {});

    if (projectId) {
      const projectRef = db.collection("projects").doc(projectId);
      projectRef.get()
        .then((snap) => {
          const current = (snap.data()?.totalRaised ?? 0) as number;
          const currentSkips = (snap.data()?.totalSkips ?? 0) as number;
          return projectRef.update({
            totalRaised: Math.max(0, current - fundraiserAmount),
            totalSkips: Math.max(0, currentSkips - 1),
          });
        })
        .catch((e) => console.warn("[skips] project totals update failed:", e));
    }

    return NextResponse.json({ causeJarBalances, goalJarBalances }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}

function resolveSkipTarget(skip: Skip, override?: SkipAllocationTarget | null): SkipAllocationTarget | null {
  if (override !== undefined) return override;
  if (skip.allocationTarget) return skip.allocationTarget;
  if (skip.projectId) return { type: "fundraiser", id: skip.projectId };
  return null;
}
