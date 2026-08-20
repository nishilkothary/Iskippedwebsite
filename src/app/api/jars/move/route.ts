import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { validateAmount, validateNonEmptyString } from "@/lib/services/serverProfileDefaults";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";
import { SkipAllocationTarget, UserProfile } from "@/lib/types/models";

type MoveEndpoint = SkipAllocationTarget | { type: "skip-bucks" };

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

function parseEndpoint(raw: unknown, field: string): MoveEndpoint {
  if (!raw || typeof raw !== "object") throw new ApiError(400, `Missing ${field}`);
  const data = raw as Record<string, unknown>;
  if (data.type === "skip-bucks") return { type: "skip-bucks" };
  const type = data.type === "goal" || data.type === "fundraiser" ? data.type : null;
  const id = validateNonEmptyString(data.id, `${field}.id`);
  if (!type) throw new ApiError(400, `Invalid ${field} type`);
  return { type, id };
}

function endpointKey(endpoint: MoveEndpoint) {
  return endpoint.type === "skip-bucks" ? "skip-bucks" : `${endpoint.type}:${endpoint.id}`;
}

function balancePath(target: SkipAllocationTarget) {
  return target.type === "goal" ? `goalJarBalances.${target.id}` : `causeJarBalances.${target.id}`;
}

function jarBalance(profile: UserProfile, target: SkipAllocationTarget) {
  return target.type === "goal"
    ? Math.max(0, profile.goalJarBalances?.[target.id] ?? 0)
    : Math.max(0, profile.causeJarBalances?.[target.id] ?? 0);
}

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();
    const source = parseEndpoint(body.source, "source");
    const destination = parseEndpoint(body.destination, "destination");
    const amount = cents(validateAmount(body.amount));
    if (amount <= 0) throw new ApiError(400, "Invalid amount");

    if (endpointKey(source) === endpointKey(destination)) {
      throw new ApiError(400, "Source and destination must be different");
    }

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);

    const movedAmount = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new ApiError(404, "User not found");
      const profile = userSnap.data() as UserProfile;
      const sourceBalance = source.type === "skip-bucks"
        ? cents(getSkipBalanceSummary(profile).unassignedSkipBank)
        : cents(jarBalance(profile, source));

      if (amount > sourceBalance) {
        throw new ApiError(400, "Move amount exceeds available balance");
      }

      const updates: Record<string, unknown> = {};
      if (source.type !== "skip-bucks") {
        updates[balancePath(source)] = cents(sourceBalance - amount);
      }
      if (destination.type !== "skip-bucks") {
        updates[balancePath(destination)] = FieldValue.increment(amount);
        if (destination.type === "fundraiser") {
          updates.joinedProjectIds = FieldValue.arrayUnion(destination.id);
        }
      }

      if (Object.keys(updates).length > 0) tx.update(userRef, updates);
      return amount;
    });

    return NextResponse.json({ movedAmount });
  } catch (e) {
    return handleApiError(e);
  }
}
