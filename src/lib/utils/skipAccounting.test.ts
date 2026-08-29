import { describe, expect, it } from "vitest";
import { getSkipBalanceSummary } from "./skipBalances";
import type { SkipLot } from "@/lib/types/models";
import {
  addSkipLot,
  balancesFromLots,
  cloneLots,
  consumeLots,
  locationKey,
  restoreConsumedLots,
  transferLots,
} from "./skipLedger";

describe("skip balance invariants", () => {
  it("excludes purchases and skip-funded donations, but not outside donations", () => {
    const summary = getSkipBalanceSummary({
      totalSaved: 100,
      totalSpent: 10,
      totalDonated: 50,
      totalDonatedFromSkips: 20,
      causeJarBalances: { fundraiser: 30 },
      goalJarBalances: { reward: 5 },
    });

    expect(summary.availableFromSkips).toBe(70);
    expect(summary.assignedToJars).toBe(35);
    expect(summary.unassignedSkipBank).toBe(35);
  });

  it("uses totalDonated as the skip-funded amount for legacy profiles", () => {
    const summary = getSkipBalanceSummary({
      totalSaved: 100,
      totalSpent: 10,
      totalDonated: 20,
      causeJarBalances: {},
      goalJarBalances: {},
    });

    expect(summary.availableFromSkips).toBe(70);
    expect(summary.unassignedSkipBank).toBe(70);
  });
});

describe("skip lot ledger invariants", () => {
  it("fills a partial legacy ledger with the missing unassigned balance", () => {
    const lots = cloneLots({
      totalSaved: 50,
      totalSpent: 0,
      totalDonated: 0,
      totalDonatedFromSkips: 0,
      causeJarBalances: { cause: 20 },
      goalJarBalances: {},
      skipLots: {
        known: {
          skipId: "known",
          createdAtMs: 1,
          originalLocation: "fundraiser:cause",
          balances: { "fundraiser:cause": 20 },
        },
      },
    });

    expect(lots["legacy:unassigned:remainder"].balances.unassigned).toBe(30);
  });

  it("rebuilds an oversized stale ledger without creating spendable money", () => {
    const lots = cloneLots({
      totalSaved: 50,
      totalSpent: 10,
      totalDonated: 0,
      totalDonatedFromSkips: 0,
      causeJarBalances: { cause: 25 },
      goalJarBalances: {},
      skipLots: {
        stale: {
          skipId: "stale",
          createdAtMs: 1,
          originalLocation: "fundraiser:cause",
          balances: { "fundraiser:cause": 500 },
        },
      },
    });

    expect(balancesFromLots(lots).causeJarBalances.cause).toBe(25);
    expect(Object.values(lots).flatMap((lot) => Object.values(lot.balances)).reduce((sum, amount) => sum + amount, 0)).toBe(40);
  });

  it("moves money without changing lifetime value", () => {
    const lots: Record<string, SkipLot> = {};
    addSkipLot(lots, "skip-1", 25, { type: "fundraiser", id: "cause-a" }, 1);
    transferLots(
      lots,
      10,
      [locationKey({ type: "fundraiser", id: "cause-a" })],
      locationKey({ type: "goal", id: "reward-b" }),
    );

    expect(balancesFromLots(lots)).toEqual({
      causeJarBalances: { "cause-a": 15 },
      goalJarBalances: { "reward-b": 10 },
    });
    expect(Object.values(lots["skip-1"].balances).reduce((sum, amount) => sum + amount, 0)).toBe(25);
  });

  it("restores the exact jar and Skip Bucks sources when a transaction is deleted", () => {
    const lots: Record<string, SkipLot> = {};
    addSkipLot(lots, "jar-skip", 12, { type: "fundraiser", id: "cause" }, 1);
    addSkipLot(lots, "bank-skip", 8, null, 2);
    const consumption = consumeLots(lots, 15, ["fundraiser:cause", "unassigned"]);

    expect(balancesFromLots(lots).causeJarBalances.cause).toBeUndefined();
    restoreConsumedLots(lots, consumption.consumedByLot);
    expect(balancesFromLots(lots).causeJarBalances.cause).toBe(12);
    expect(lots["bank-skip"].balances.unassigned).toBe(8);
  });
});
