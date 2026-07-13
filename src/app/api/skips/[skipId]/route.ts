import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { normalizeJarSplitServer } from "@/lib/services/serverProfileDefaults";
import { UserProfile, Skip } from "@/lib/types/models";

type RouteContext = { params: Promise<{ skipId: string }> };

const EDITABLE_FIELDS = ["category", "categoryLabel", "categoryEmoji", "amount", "projectId", "projectTitle", "whatSkipped", "notes", "jarSplit"] as const;

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

    const { projectId, giveAllocDelta, amountDelta, resolvedAmount, resolvedCategoryLabel } = await db.runTransaction(async (tx) => {
      const [skipSnap, userSnap] = await Promise.all([tx.get(skipRef), tx.get(userRef)]);
      if (!skipSnap.exists) throw new ApiError(404, "Skip not found");
      const skip = skipSnap.data() as Skip;
      const profile = userSnap.data() as UserProfile;

      const defaultSplit = normalizeJarSplitServer(profile.jarSplit as any);
      const oldAmount = skip.amount;
      const newAmount = (updates.amount as number | undefined) ?? oldAmount;
      const amountDelta = newAmount - oldAmount;
      const oldSplit = skip.jarSplit ?? defaultSplit;
      const newSplit = (updates.jarSplit as { give: number; live: number } | undefined) ?? oldSplit;
      const oldGiveAlloc = oldAmount * (oldSplit.give / 100);
      const newGiveAlloc = newAmount * (newSplit.give / 100);
      const oldLiveAlloc = oldAmount * (oldSplit.live / 100);
      const newLiveAlloc = newAmount * (newSplit.live / 100);
      const giveAllocDelta = newGiveAlloc - oldGiveAlloc;
      const liveAllocDelta = newLiveAlloc - oldLiveAlloc;
      const projectId = skip.projectId;

      if (Object.keys(updates).length > 0) tx.update(skipRef, updates);

      const userUpdate: Record<string, unknown> = {};
      if (amountDelta !== 0) userUpdate.totalSaved = FieldValue.increment(amountDelta);
      if (giveAllocDelta !== 0) userUpdate.totalGiveAllocated = FieldValue.increment(giveAllocDelta);
      if (liveAllocDelta !== 0) userUpdate.totalLiveAllocated = FieldValue.increment(liveAllocDelta);
      if (giveAllocDelta !== 0 && projectId) userUpdate[`causeJarBalances.${projectId}`] = FieldValue.increment(giveAllocDelta);
      if (Object.keys(userUpdate).length > 0) tx.update(userRef, userUpdate);

      return {
        projectId,
        giveAllocDelta,
        amountDelta,
        resolvedAmount: newAmount,
        resolvedCategoryLabel: (updates.categoryLabel as string | undefined) ?? skip.categoryLabel,
      };
    });

    // Sync project totalRaised after the user batch commits (best-effort, matches prior behavior)
    if (projectId && giveAllocDelta !== 0) {
      const projectRef = db.collection("projects").doc(projectId);
      if (giveAllocDelta > 0) {
        projectRef.update({ totalRaised: FieldValue.increment(giveAllocDelta) })
          .catch((e) => console.warn("[skips] project totalRaised increment failed:", e));
      } else {
        projectRef.get()
          .then((snap) => {
            const current = (snap.data()?.totalRaised ?? 0) as number;
            return projectRef.update({ totalRaised: Math.max(0, current + giveAllocDelta) });
          })
          .catch((e) => console.warn("[skips] project totalRaised decrement failed:", e));
      }
    }

    // Sync community feed message/amount if the amount changed (best-effort)
    if (amountDelta !== 0) {
      db.collection("communityFeed").doc(skipId).update({
        skipAmount: resolvedAmount,
        message: `skipped ${resolvedCategoryLabel} and saved $${resolvedAmount.toFixed(2)}`,
      }).catch(() => {});
    }

    return NextResponse.json({}, { status: 200 });
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

    const { projectId, giveAllocAmount } = await db.runTransaction(async (tx) => {
      const [skipSnap, userSnap] = await Promise.all([tx.get(skipRef), tx.get(userRef)]);
      if (!skipSnap.exists) throw new ApiError(404, "Skip not found");
      const skip = skipSnap.data() as Skip;
      const profile = userSnap.data() as UserProfile;
      const split = skip.jarSplit ?? normalizeJarSplitServer(profile.jarSplit as any);
      const giveAllocAmount = skip.amount * (split.give / 100);
      const liveAllocAmount = skip.amount * (split.live / 100);

      tx.delete(skipRef);
      tx.update(userRef, {
        totalSaved: FieldValue.increment(-skip.amount),
        totalSkips: FieldValue.increment(-1),
        totalGiveAllocated: FieldValue.increment(-giveAllocAmount),
        totalLiveAllocated: FieldValue.increment(-liveAllocAmount),
        ...(skip.projectId ? { [`causeJarBalances.${skip.projectId}`]: FieldValue.increment(-giveAllocAmount) } : {}),
      });

      return { projectId: skip.projectId, giveAllocAmount };
    });

    db.collection("communityFeed").doc(skipId).delete().catch(() => {});

    if (projectId && giveAllocAmount > 0) {
      const projectRef = db.collection("projects").doc(projectId);
      projectRef.get()
        .then((snap) => {
          const current = (snap.data()?.totalRaised ?? 0) as number;
          return projectRef.update({ totalRaised: Math.max(0, current - giveAllocAmount) });
        })
        .catch((e) => console.warn("[skips] project totalRaised update failed:", e));
    }

    return NextResponse.json({}, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
