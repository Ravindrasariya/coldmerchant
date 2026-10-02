import { and, eq, sql } from "drizzle-orm";
import { seedLots, seedTransactionItems } from "@shared/schema";
import { SeedDeletionError } from "./seed-deletion";

export class SeedLotProtectionError extends SeedDeletionError {
  constructor(code: string, message: string, public minimumBags?: number, status = 409) {
    super(code, message, status);
  }
}

/** Caller holds the merchant seed-activity lock before reading inventory. */
export async function seedLotSoldState(tx: any, id: number, merchantId: number) {
  const [lot] = await tx.select().from(seedLots)
    .where(and(eq(seedLots.id, id), eq(seedLots.merchantId, merchantId)));
  if (!lot) throw new SeedLotProtectionError("SEED_LOT_NOT_FOUND", "Seed lot not found", undefined, 404);
  const [history] = await tx.select({
    sold: sql<number>`COALESCE(SUM(${seedTransactionItems.bagsMoved}), 0)::int`,
    links: sql<number>`COUNT(*)::int`,
  }).from(seedTransactionItems)
    .where(and(eq(seedTransactionItems.seedLotId, id), eq(seedTransactionItems.merchantId, merchantId)));
  // A missing/stale counter cannot conceal linked sales. Conversely, don't
  // erase persistent sold history just because old item records are incomplete.
  return { lot, sold: Math.max(0, lot.soldBags ?? 0, history.sold), links: history.links };
}

export function validateSeedLotCapacity(originalBags: number, sold: number) {
  if (!Number.isSafeInteger(originalBags) || originalBags < 0 || originalBags > 2147483647) {
    throw new SeedLotProtectionError("INVALID_BAG_COUNT", "Original bags must be a non-negative whole number", undefined, 400);
  }
  if (originalBags < sold) {
    throw new SeedLotProtectionError("SEED_BAGS_BELOW_SOLD",
      `Cannot reduce original bags below ${sold} — that many bags have already been sold via seed transactions.`, sold);
  }
}