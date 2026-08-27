import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { adjustGlobalStats } from "@/lib/services/globalStats";
import { UserProfile, Skip, SkipAllocationTarget, SkipSourceAllocation, SkipValueSource } from "@/lib/types/models";
import { getSkipBalanceSummary, removeUnspentSkipValue } from "@/lib/utils/skipBalances";
import { adjustSkipLot, balancesFromLots, cloneLots, consumeLots, locationKey, removeSkipLot } from "@/lib/utils/skipLedger";

type RouteContext = { params: Promise<{ skipId: string }> };

const EDITABLE_FIELDS = ["category", "categoryLabel", "categoryEmoji", "amount", "projectId", "projectTitle", "whatSkipped", "notes", "allocationTarget"] as const;

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const uid = await requireUid(req);
    const { skipId } = await ctx.params;
    const body = await req.json();
    const rawUpdates: Record<string, unknown> = typeof body.updates === "object" && body.updates ? body.updates : {};
    const sourceAllocations = parseSourceAllocations(body.sourceAllocations);
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

    const { amountDelta, resolvedAmount, resolvedCategoryLabel, causeJarBalances, goalJarBalances } = await db.runTransaction(async (tx) => {
      const [skipSnap, userSnap] = await Promise.all([tx.get(skipRef), tx.get(userRef)]);
      if (!skipSnap.exists) throw new ApiError(404, "Skip not found");
      const skip = skipSnap.data() as Skip;
      const profile = userSnap.data() as UserProfile;

      const oldAmount = skip.amount;
      const newAmount = (updates.amount as number | undefined) ?? oldAmount;
      const amountDelta = newAmount - oldAmount;
      const allocationTarget = resolveSkipTarget(skip, updates.allocationTarget as SkipAllocationTarget | null | undefined);
      const fundraiserDeltas: Record<string, number> = {};
      if (amountDelta > 0 && allocationTarget?.type === "fundraiser") {
        fundraiserDeltas[allocationTarget.id] = amountDelta;
      } else if (amountDelta < 0) {
        for (const allocation of sourceAllocations ?? [{ source: allocationTarget ?? { type: "skip-bucks" as const }, amount: -amountDelta }]) {
          if (allocation.source.type === "fundraiser") {
            fundraiserDeltas[allocation.source.id] = Math.round((fundraiserDeltas[allocation.source.id] ?? 0) - allocation.amount * 100) / 100;
          }
        }
      }
      const ledgerAware = Boolean(profile.skipLots?.[skip.id]);
      const skipLots = ledgerAware ? cloneLots(profile) : null;
      let reconciledBalances: { causeJarBalances: Record<string, number>; goalJarBalances: Record<string, number> } | null = null;
      if (ledgerAware && skipLots) {
        try {
          if (amountDelta < 0 && sourceAllocations) applySourcePlanToLots(skipLots, sourceAllocations, -amountDelta);
          else adjustSkipLot(skipLots, skip.id, oldAmount, newAmount);
          reconciledBalances = balancesFromLots(skipLots);
        } catch (error) {
          throw new ApiError(409, error instanceof Error ? error.message : "This edit cannot be applied safely.");
        }
      } else if (amountDelta < 0 && sourceAllocations) {
        try {
          reconciledBalances = applySourcePlanToBalances(profile, sourceAllocations, -amountDelta);
        } catch (error) {
          throw new ApiError(409, error instanceof Error ? error.message : "This edit cannot be applied safely.");
        }
      } else if (amountDelta < 0) {
        try {
          reconciledBalances = removeUnspentSkipValue(profile, -amountDelta, allocationTarget, profile.activeSkipTarget);
        } catch (error) {
          throw new ApiError(409, error instanceof Error ? error.message : "This edit cannot be applied safely.");
        }
      }

      const projectRefs = new Map<string, FirebaseFirestore.DocumentReference>();
      for (const fundraiserId of Object.keys(fundraiserDeltas)) {
        projectRefs.set(fundraiserId, db.collection("projects").doc(fundraiserId));
      }
      const projectSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const [fundraiserId, projectRef] of projectRefs) {
        projectSnaps.set(fundraiserId, await tx.get(projectRef));
      }

      if (Object.keys(updates).length > 0) tx.update(skipRef, updates);

      const userUpdate: Record<string, unknown> = {};
      if (amountDelta !== 0) userUpdate.totalSaved = FieldValue.increment(amountDelta);
      if (reconciledBalances) {
        userUpdate.causeJarBalances = reconciledBalances.causeJarBalances;
        userUpdate.goalJarBalances = reconciledBalances.goalJarBalances;
      }
      if (skipLots) userUpdate.skipLots = skipLots;
      if (amountDelta !== 0 && allocationTarget?.type === "fundraiser") {
        userUpdate.savedTowardActiveCause = Math.max(
          0,
          (profile.savedTowardActiveCause ?? 0) + amountDelta
        );
      }
      if (!skipLots && amountDelta !== 0 && allocationTarget?.type === "goal") {
        if (amountDelta > 0) userUpdate[`goalJarBalances.${allocationTarget.id}`] = Math.max(0, (profile.goalJarBalances?.[allocationTarget.id] ?? 0) + amountDelta);
      }
      if (!skipLots && amountDelta !== 0 && allocationTarget?.type === "fundraiser") {
        if (amountDelta > 0) userUpdate[`causeJarBalances.${allocationTarget.id}`] = Math.max(0, (profile.causeJarBalances?.[allocationTarget.id] ?? 0) + amountDelta);
      }
      if (Object.keys(userUpdate).length > 0) tx.update(userRef, userUpdate);

      for (const [fundraiserId, projectRef] of projectRefs) {
        const project = projectSnaps.get(fundraiserId)?.data() ?? {};
        const delta = fundraiserDeltas[fundraiserId] ?? 0;
        tx.set(projectRef, {
          totalRaised: Math.max(0, Number(project.totalRaised ?? 0) + delta),
        }, { merge: true });
      }

      return {
        projectId: allocationTarget?.type === "fundraiser" ? allocationTarget.id : null,
        amountDelta,
        resolvedAmount: newAmount,
        resolvedCategoryLabel: (updates.categoryLabel as string | undefined) ?? skip.categoryLabel,
        causeJarBalances: reconciledBalances?.causeJarBalances,
        goalJarBalances: reconciledBalances?.goalJarBalances,
        fundraiserDeltas,
      };
    });

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
    const body = await req.json().catch(() => ({}));
    const sourceAllocations = parseSourceAllocations(body.sourceAllocations);

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const skipRef = userRef.collection("skips").doc(skipId);

    const { deletedAmount, causeJarBalances, goalJarBalances } = await db.runTransaction(async (tx) => {
      const [skipSnap, userSnap] = await Promise.all([tx.get(skipRef), tx.get(userRef)]);
      if (!skipSnap.exists) throw new ApiError(404, "Skip not found");
      const skip = skipSnap.data() as Skip;
      const profile = userSnap.data() as UserProfile;
      const allocationTarget = resolveSkipTarget(skip);
      const ledgerAware = Boolean(profile.skipLots?.[skip.id]);
      const skipLots = ledgerAware ? cloneLots(profile) : null;
      let nextBalances;
      let ledgerProjectDeltas: Record<string, number> = {};
      if (skipLots) {
        try {
          if (sourceAllocations) {
            applySourcePlanToLots(skipLots, sourceAllocations, skip.amount);
            for (const allocation of sourceAllocations) {
              if (allocation.source.type === "fundraiser") {
                ledgerProjectDeltas[allocation.source.id] = Math.round((ledgerProjectDeltas[allocation.source.id] ?? 0) + allocation.amount * 100) / 100;
              }
            }
          } else {
            const removedByLocation = removeSkipLot(skipLots, skip.id, skip.amount);
            for (const [location, value] of Object.entries(removedByLocation)) {
              if (location.startsWith("fundraiser:")) {
                const projectId = location.slice("fundraiser:".length);
                ledgerProjectDeltas[projectId] = Math.round((ledgerProjectDeltas[projectId] ?? 0) + value * 100) / 100;
              }
            }
          }
          nextBalances = balancesFromLots(skipLots);
        } catch (error) {
          throw new ApiError(409, error instanceof Error ? error.message : "This skip cannot be deleted safely.");
        }
      } else if (sourceAllocations) {
        try {
          nextBalances = applySourcePlanToBalances(profile, sourceAllocations, skip.amount);
          for (const [sourceId, amount] of Object.entries(nextBalances.causeJarBalances)) {
            if (amount <= 0) delete nextBalances.causeJarBalances[sourceId];
          }
          for (const [sourceId, amount] of Object.entries(nextBalances.goalJarBalances)) {
            if (amount <= 0) delete nextBalances.goalJarBalances[sourceId];
          }
        } catch (error) {
          throw new ApiError(409, error instanceof Error ? error.message : "This skip cannot be deleted safely.");
        }
      } else {
        try {
          nextBalances = removeUnspentSkipValue(profile, skip.amount, allocationTarget, profile.activeSkipTarget);
        } catch (error) {
          throw new ApiError(409, error instanceof Error ? error.message : "This skip cannot be deleted safely.");
        }
      }

      const allocatedProjectId = allocationTarget?.type === "fundraiser" ? allocationTarget.id : null;
      const projectRefs = new Map<string, FirebaseFirestore.DocumentReference>();
      for (const fundraiserId of Object.keys(ledgerProjectDeltas)) {
        projectRefs.set(fundraiserId, db.collection("projects").doc(fundraiserId));
      }
      if (allocatedProjectId && !projectRefs.has(allocatedProjectId)) {
        projectRefs.set(allocatedProjectId, db.collection("projects").doc(allocatedProjectId));
      }
      const projectSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const [fundraiserId, projectRef] of projectRefs) {
        projectSnaps.set(fundraiserId, await tx.get(projectRef));
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
        ...(skipLots ? { skipLots } : {}),
      };
      tx.update(userRef, userUpdate);

      for (const [fundraiserId, projectRef] of projectRefs) {
        const project = projectSnaps.get(fundraiserId)?.data() ?? {};
        const removedAmount = ledgerProjectDeltas[fundraiserId] ?? (fundraiserId === allocatedProjectId ? skip.amount : 0);
        const removedSkip = fundraiserId === allocatedProjectId ? 1 : 0;
        tx.set(projectRef, {
          totalRaised: Math.max(0, Number(project.totalRaised ?? 0) - removedAmount),
          totalSkips: Math.max(0, Number(project.totalSkips ?? 0) - removedSkip),
        }, { merge: true });
      }

      return {
        projectId: allocatedProjectId,
        fundraiserAmount: allocationTarget?.type === "fundraiser" ? skip.amount : 0,
        deletedAmount: skip.amount,
        causeJarBalances: nextBalances.causeJarBalances,
        goalJarBalances: nextBalances.goalJarBalances,
        ledgerProjectDeltas,
      };
    });

    await adjustGlobalStats(-deletedAmount, -1);

    db.collection("communityFeed").doc(skipId).delete().catch(() => {});

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

function parseSourceAllocations(raw: unknown): SkipSourceAllocation[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new ApiError(400, "Invalid source allocation plan");
  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") throw new ApiError(400, "Invalid source allocation");
    const data = entry as Record<string, unknown>;
    const source = data.source;
    if (!source || typeof source !== "object") throw new ApiError(400, "Invalid source allocation source");
    const sourceData = source as Record<string, unknown>;
    let parsedSource: SkipValueSource;
    if (sourceData.type === "skip-bucks") parsedSource = { type: "skip-bucks" };
    else if (sourceData.type === "goal" || sourceData.type === "fundraiser" && typeof sourceData.id === "string") {
      if (typeof sourceData.id !== "string" || !sourceData.id.trim()) throw new ApiError(400, "Invalid source allocation target");
      parsedSource = { type: sourceData.type, id: sourceData.id } as SkipAllocationTarget;
    } else throw new ApiError(400, "Invalid source allocation target");
    const amount = typeof data.amount === "number" ? Math.round(data.amount * 100) / 100 : 0;
    if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "Invalid source allocation amount");
    return { source: parsedSource, amount };
  });
}

function sourceLocation(source: SkipValueSource) {
  return source.type === "skip-bucks" ? "unassigned" : locationKey(source);
}

function validatePlanTotal(plan: SkipSourceAllocation[], amount: number) {
  const planned = Math.round(plan.reduce((sum, allocation) => sum + allocation.amount, 0) * 100) / 100;
  if (Math.abs(planned - Math.round(amount * 100) / 100) > 0.001) {
    throw new Error("The source allocation plan does not match the amount being removed.");
  }
}

function applySourcePlanToLots(
  skipLots: Record<string, import("@/lib/types/models").SkipLot>,
  plan: SkipSourceAllocation[],
  amount: number,
) {
  validatePlanTotal(plan, amount);
  for (const allocation of plan) {
    consumeLots(skipLots, allocation.amount, [sourceLocation(allocation.source)]);
  }
}

function applySourcePlanToBalances(
  profile: UserProfile,
  plan: SkipSourceAllocation[],
  amount: number,
) {
  validatePlanTotal(plan, amount);
  const causeJarBalances = { ...(profile.causeJarBalances ?? {}) };
  const goalJarBalances = { ...(profile.goalJarBalances ?? {}) };
  const availableSkipBucks = getSkipBalanceSummary(profile).unassignedSkipBank;
  let availableFromSkipBucks = availableSkipBucks;
  for (const allocation of plan) {
    if (allocation.source.type === "skip-bucks") {
      if (allocation.amount > availableFromSkipBucks + 0.001) throw new Error("The source allocation exceeds available Skip Bucks.");
      availableFromSkipBucks = Math.round((availableFromSkipBucks - allocation.amount) * 100) / 100;
      continue;
    }
    const balances = allocation.source.type === "goal" ? goalJarBalances : causeJarBalances;
    const available = Math.max(0, Number(balances[allocation.source.id]) || 0);
    if (allocation.amount > available + 0.001) throw new Error("The source allocation exceeds a jar balance.");
    balances[allocation.source.id] = Math.round((available - allocation.amount) * 100) / 100;
  }
  return { causeJarBalances, goalJarBalances };
}
