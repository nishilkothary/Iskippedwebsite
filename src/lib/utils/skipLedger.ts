import type { SkipAllocationTarget, SkipLot, UserProfile } from "@/lib/types/models";
import { getSkipBalanceSummary } from "./skipBalances";

export const UNASSIGNED_LOCATION = "unassigned";

export function locationKey(target: SkipAllocationTarget | null | undefined): string {
  return target ? `${target.type}:${target.id}` : UNASSIGNED_LOCATION;
}

export function cloneLots(profile: Pick<UserProfile, "skipLots" | "totalSaved" | "totalSpent" | "totalDonated" | "causeJarBalances" | "goalJarBalances">): Record<string, SkipLot> {
  if (profile.skipLots && Object.keys(profile.skipLots).length > 0) {
    const lots = Object.fromEntries(Object.entries(profile.skipLots).map(([id, lot]) => [id, {
      ...lot,
      balances: { ...(lot.balances ?? {}) },
    }]));
    const ledgerTotal = Object.values(lots).reduce((sum, lot) => sum + totalLot(lot), 0);
    const availableFromSkips = getSkipBalanceSummary(profile).availableFromSkips;
    if (ledgerTotal <= availableFromSkips + 0.001) return lots;

    // Legacy/stale lots must never create more spendable money than the
    // account's actual unspent savings. Rebuild conservatively when the
    // ledger is inconsistent.
    return buildLegacyLots(profile, availableFromSkips);
  }

  return buildLegacyLots(profile, getSkipBalanceSummary(profile).availableFromSkips);
}

function buildLegacyLots(
  profile: Pick<UserProfile, "totalSaved" | "totalSpent" | "totalDonated" | "causeJarBalances" | "goalJarBalances">,
  availableFromSkips: number,
) {
  // Exact provenance predates this field, so preserve existing balances as
  // synthetic lots rather than inventing which historical skip funded them.
  const lots: Record<string, SkipLot> = {};
  let remaining = Math.max(0, availableFromSkips);
  const addLegacy = (location: string, amount: number) => {
    const safeAmount = Math.min(Math.max(0, amount), remaining);
    if (safeAmount <= 0) return;
    const id = `legacy:${location}`;
    lots[id] = {
      skipId: id,
      createdAtMs: 0,
      originalLocation: location,
      balances: { [location]: Math.round(safeAmount * 100) / 100 },
    };
    remaining = Math.max(0, Math.round((remaining - safeAmount) * 100) / 100);
  };
  for (const [id, amount] of Object.entries(profile.goalJarBalances ?? {})) addLegacy(`goal:${id}`, Math.max(0, Number(amount) || 0));
  for (const [id, amount] of Object.entries(profile.causeJarBalances ?? {})) addLegacy(`fundraiser:${id}`, Math.max(0, Number(amount) || 0));
  addLegacy(UNASSIGNED_LOCATION, remaining);
  return lots;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function totalLot(lot: SkipLot) {
  return Object.values(lot.balances ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

function orderedLots(lots: Record<string, SkipLot>) {
  return Object.entries(lots).sort(([, a], [, b]) => b.createdAtMs - a.createdAtMs || b.skipId.localeCompare(a.skipId));
}

export function addSkipLot(
  lots: Record<string, SkipLot>,
  skipId: string,
  amount: number,
  target: SkipAllocationTarget | null | undefined,
  createdAtMs = Date.now(),
) {
  const location = locationKey(target);
  lots[skipId] = {
    skipId,
    createdAtMs,
    originalLocation: location,
    balances: { [location]: roundMoney(amount) },
  };
}

export function transferLots(
  lots: Record<string, SkipLot>,
  amount: number,
  sourceLocations: string[],
  destination: string,
) {
  let remaining = roundMoney(amount);
  for (const source of sourceLocations) {
    for (const [, lot] of orderedLots(lots)) {
      if (remaining <= 0) break;
      const available = Math.max(0, Number(lot.balances[source]) || 0);
      if (available <= 0) continue;
      const moved = Math.min(available, remaining);
      lot.balances[source] = roundMoney(available - moved);
      lot.balances[destination] = roundMoney((lot.balances[destination] ?? 0) + moved);
      remaining = roundMoney(remaining - moved);
    }
    if (remaining <= 0) break;
  }
  if (remaining > 0.001) throw new Error("Move amount exceeds the available Skip Bucks balance.");
  return roundMoney(amount);
}

export function consumeLots(lots: Record<string, SkipLot>, amount: number, sourceLocations: string[]) {
  let remaining = roundMoney(amount);
  const consumedByLot: Record<string, Record<string, number>> = {};
  for (const source of sourceLocations) {
    for (const [, lot] of orderedLots(lots)) {
      if (remaining <= 0) break;
      const available = Math.max(0, Number(lot.balances[source]) || 0);
      if (available <= 0) continue;
      const consumed = Math.min(available, remaining);
      lot.balances[source] = roundMoney(available - consumed);
      consumedByLot[lot.skipId] ??= {};
      consumedByLot[lot.skipId][source] = roundMoney((consumedByLot[lot.skipId][source] ?? 0) + consumed);
      remaining = roundMoney(remaining - consumed);
    }
    if (remaining <= 0) break;
  }
  if (remaining > 0.001) throw new Error("The transaction exceeds available Skip Bucks.");
  return { amount: roundMoney(amount), consumedByLot };
}

export function restoreConsumedLots(lots: Record<string, SkipLot>, consumedByLot: Record<string, Record<string, number>> | undefined) {
  for (const [skipId, locations] of Object.entries(consumedByLot ?? {})) {
    const lot = lots[skipId];
    if (!lot) continue;
    for (const [location, amount] of Object.entries(locations)) {
      lot.balances[location] = roundMoney((lot.balances[location] ?? 0) + Math.max(0, Number(amount) || 0));
    }
  }
}

export function reduceConsumedLots(
  lots: Record<string, SkipLot>,
  consumedByLot: Record<string, Record<string, number>> | undefined,
  amount: number,
) {
  const next = Object.fromEntries(Object.entries(consumedByLot ?? {}).map(([id, locations]) => [id, { ...locations }])) as Record<string, Record<string, number>>;
  let remaining = roundMoney(amount);
  for (const skipId of Object.keys(next).reverse()) {
    const lot = lots[skipId];
    if (!lot) continue;
    for (const location of Object.keys(next[skipId]).reverse()) {
      if (remaining <= 0) break;
      const available = Math.max(0, Number(next[skipId][location]) || 0);
      const restored = Math.min(available, remaining);
      lot.balances[location] = roundMoney((lot.balances[location] ?? 0) + restored);
      next[skipId][location] = roundMoney(available - restored);
      remaining = roundMoney(remaining - restored);
      if (next[skipId][location] <= 0) delete next[skipId][location];
    }
    if (Object.keys(next[skipId]).length === 0) delete next[skipId];
    if (remaining <= 0) break;
  }
  if (remaining > 0.001) throw new Error("The transaction history cannot be reconciled safely.");
  return next;
}

export function removeSkipLot(lots: Record<string, SkipLot>, skipId: string, amount: number) {
  const lot = lots[skipId];
  if (!lot || totalLot(lot) + 0.001 < amount) {
    throw new Error("This skip's value has already been spent and cannot be deleted safely.");
  }
  let remaining = roundMoney(amount);
  const removedByLocation: Record<string, number> = {};
  const locations = [lot.originalLocation, ...Object.keys(lot.balances).filter((key) => key !== lot.originalLocation).sort()];
  for (const location of locations) {
    const available = Math.max(0, Number(lot.balances[location]) || 0);
    const removed = Math.min(available, remaining);
    lot.balances[location] = roundMoney(available - removed);
    if (removed > 0) removedByLocation[location] = roundMoney((removedByLocation[location] ?? 0) + removed);
    remaining = roundMoney(remaining - removed);
    if (remaining <= 0) break;
  }
  if (remaining > 0.001) throw new Error("This skip's value cannot be reconciled safely.");
  if (totalLot(lot) <= 0.001) delete lots[skipId];
  return removedByLocation;
}

export function adjustSkipLot(lots: Record<string, SkipLot>, skipId: string, oldAmount: number, newAmount: number) {
  const delta = roundMoney(newAmount - oldAmount);
  if (delta < 0) removeSkipLot(lots, skipId, -delta);
  if (delta > 0) {
    const lot = lots[skipId];
    if (!lot) throw new Error("Skip provenance is unavailable for this edit.");
    lot.balances[lot.originalLocation] = roundMoney((lot.balances[lot.originalLocation] ?? 0) + delta);
  }
}

export function balancesFromLots(lots: Record<string, SkipLot>) {
  const goalJarBalances: Record<string, number> = {};
  const causeJarBalances: Record<string, number> = {};
  for (const lot of Object.values(lots)) {
    for (const [location, amount] of Object.entries(lot.balances)) {
      if (location === UNASSIGNED_LOCATION || amount <= 0) continue;
      const [type, id] = location.split(":");
      const record = type === "goal" ? goalJarBalances : causeJarBalances;
      record[id] = roundMoney((record[id] ?? 0) + amount);
    }
  }
  return { goalJarBalances, causeJarBalances };
}
