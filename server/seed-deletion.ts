import { and, eq, inArray, sql } from "drizzle-orm";
import {
  cashEntries, coldStoreChargeAllocations, seedLots, seedStockEntries,
  seedStockEntryEditHistory, seedTransactions, seedTransactionItems,
  seedTransactionEditHistory,
} from "@shared/schema";

/** Shared with cash writes and sale creation; acquire before any row locks. */
export async function lockSeedActivity(tx: any, merchantId: number): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(14501, ${merchantId})`);
}

export class SeedDeletionError extends Error {
  constructor(public code: string, message: string, public status = 409) {
    super(message);
    this.name = "SeedDeletionError";
  }
}

const normalize = (value: string | null | undefined) => (value || "").trim().toLowerCase();
const positive = (value: unknown) => Number(value || 0) > 0;
const active = (entry: any) => entry.isReversed !== true;

export async function checkSeedTransactionDeletion(tx: any, id: number, merchantId: number) {
  const [txn] = await tx.select().from(seedTransactions)
    .where(and(eq(seedTransactions.id, id), eq(seedTransactions.merchantId, merchantId)));
  if (!txn) throw new SeedDeletionError("SEED_TRANSACTION_NOT_FOUND", "Seed transaction not found", 404);
  const payments = await tx.select().from(cashEntries)
    .where(and(eq(cashEntries.merchantId, merchantId), eq(cashEntries.direction, "inward"),
      eq(cashEntries.revenueType, "seed_sale")));
  const blocked = payments.some((entry: any) => {
    if (!active(entry)) return false;
    if (Array.isArray(entry.seedSettlementTargets) && entry.seedSettlementTargets.length) {
      return entry.seedSettlementTargets.some((target: any) =>
        target.seedTransactionId === id && (positive(target.amount) || positive(target.pettyAdjustment)));
    }
    // Old receipts have no destinations. Do not infer "unpaid" from current due
    // or guess a FIFO destination: conservatively protect all matching sales.
    if (!positive(entry.amount) && !positive(entry.pettyAdjustment)) return false;
    if (entry.farmerId != null && txn.farmerId != null) return entry.farmerId === txn.farmerId;
    return normalize(entry.farmerName) === normalize(txn.farmerName) &&
      (!normalize(entry.farmerContact) || normalize(entry.farmerContact) === normalize(txn.farmerContact)) &&
      (!normalize(entry.farmerVillage) || normalize(entry.farmerVillage) === normalize(txn.village));
  });
  if (blocked) throw new SeedDeletionError("SEED_PAYMENT_ACTIVE",
    "Please reverse the payment before deleting this transaction");
  return txn;
}

export async function checkSeedEntryDeletion(tx: any, id: number, merchantId: number) {
  const [entry] = await tx.select().from(seedStockEntries)
    .where(and(eq(seedStockEntries.id, id), eq(seedStockEntries.merchantId, merchantId)));
  if (!entry) throw new SeedDeletionError("SEED_ENTRY_NOT_FOUND", "Seed stock entry not found", 404);
  const lots = await tx.select().from(seedLots)
    .where(and(eq(seedLots.seedEntryId, id), eq(seedLots.merchantId, merchantId)));
  const lotIds = lots.map((lot: any) => lot.id);
  if (lotIds.length) {
    const linked = await tx.select({ id: seedTransactionItems.id }).from(seedTransactionItems)
      .where(and(eq(seedTransactionItems.merchantId, merchantId), inArray(seedTransactionItems.seedLotId, lotIds))).limit(1);
    if (linked.length) throw new SeedDeletionError("SEED_TRANSACTIONS_LINKED",
      "Please delete the linked seed transactions before deleting this stock entry");
  }
  const payments = await tx.select().from(cashEntries)
    .where(eq(cashEntries.merchantId, merchantId));
  if (positive(entry.amountPaid) || payments.some((payment: any) => active(payment) &&
      payment.direction === "outflow" && payment.expenseType === "supplier" &&
      normalize(payment.supplierName) === normalize(entry.supplierName) &&
      (positive(payment.amount) || positive(payment.pettyAdjustment)))) {
    throw new SeedDeletionError("SEED_SUPPLIER_PAYMENT_ACTIVE",
      "Please reverse the supplier payment before deleting this stock entry");
  }
  const allocations = await tx.select().from(coldStoreChargeAllocations)
    .where(eq(coldStoreChargeAllocations.merchantId, merchantId));
  const paymentMap = new Map(payments.map((p: any) => [p.id, p]));
  const linkedPayment = allocations.some((a: any) => lotIds.includes(a.seedLotId) &&
    paymentMap.has(a.cashEntryId) && active(paymentMap.get(a.cashEntryId)));
  const legacyPayment = payments.some((p: any) => active(p) && p.direction === "outflow" &&
    p.expenseType === "cold_store_charge" && (positive(p.amount) || positive(p.pettyAdjustment)) &&
    !allocations.some((a: any) => a.cashEntryId === p.id) &&
    lots.some((lot: any) => lot.coldStoreDbId != null && p.coldStoreDbId != null
      ? lot.coldStoreDbId === p.coldStoreDbId
      : normalize(lot.coldStoreName) === normalize(p.coldStoreName)));
  if (lots.some((lot: any) => positive(lot.coldStoreChargesPaid)) || linkedPayment || legacyPayment) {
    throw new SeedDeletionError("SEED_COLD_STORE_PAYMENT_ACTIVE",
      "Please reverse the cold-store payment before deleting this stock entry");
  }
  return { entry, lotIds };
}

export async function deleteSeedTransactionAtomic(tx: any, id: number, merchantId: number) {
  await lockSeedActivity(tx, merchantId);
  await checkSeedTransactionDeletion(tx, id, merchantId);
  const items = await tx.select().from(seedTransactionItems)
    .where(and(eq(seedTransactionItems.seedTransactionId, id), eq(seedTransactionItems.merchantId, merchantId)));
  await tx.delete(seedTransactionItems)
    .where(and(eq(seedTransactionItems.seedTransactionId, id), eq(seedTransactionItems.merchantId, merchantId)));
  for (const lotId of new Set<number>(items.map((item: any) => item.seedLotId))) {
    // Rebuild both counts from remaining sale history, not a possibly stale
    // remainingBags counter. Lot pickers and stock cards now read the same data.
    const [history] = await tx.select({ sold: sql<number>`COALESCE(SUM(${seedTransactionItems.bagsMoved}), 0)::int` })
      .from(seedTransactionItems).where(and(eq(seedTransactionItems.seedLotId, lotId), eq(seedTransactionItems.merchantId, merchantId)));
    await tx.update(seedLots).set({
      soldBags: history.sold,
      remainingBags: sql`GREATEST(0, ${seedLots.originalBags} - ${history.sold})`,
    }).where(and(eq(seedLots.id, lotId), eq(seedLots.merchantId, merchantId)));
  }
  await tx.delete(seedTransactionEditHistory)
    .where(and(eq(seedTransactionEditHistory.seedTransactionId, id), eq(seedTransactionEditHistory.merchantId, merchantId)));
  await tx.delete(seedTransactions)
    .where(and(eq(seedTransactions.id, id), eq(seedTransactions.merchantId, merchantId)));
  // Reversed JSON destinations have no FK and are retained as cash audit history.
}

export async function deleteSeedEntryAtomic(tx: any, id: number, merchantId: number) {
  await lockSeedActivity(tx, merchantId);
  const { lotIds } = await checkSeedEntryDeletion(tx, id, merchantId);
  if (lotIds.length) {
    const reversed = tx.select({ id: cashEntries.id }).from(cashEntries)
      .where(and(eq(cashEntries.merchantId, merchantId), eq(cashEntries.isReversed, true)));
    // Detach reversed allocation references without erasing payment history.
    await tx.update(coldStoreChargeAllocations).set({ seedLotId: null })
      .where(and(eq(coldStoreChargeAllocations.merchantId, merchantId),
        inArray(coldStoreChargeAllocations.seedLotId, lotIds),
        inArray(coldStoreChargeAllocations.cashEntryId, reversed)));
  }
  await tx.delete(seedStockEntryEditHistory)
    .where(and(eq(seedStockEntryEditHistory.seedEntryId, id), eq(seedStockEntryEditHistory.merchantId, merchantId)));
  await tx.delete(seedLots)
    .where(and(eq(seedLots.seedEntryId, id), eq(seedLots.merchantId, merchantId)));
  await tx.delete(seedStockEntries)
    .where(and(eq(seedStockEntries.id, id), eq(seedStockEntries.merchantId, merchantId)));
}