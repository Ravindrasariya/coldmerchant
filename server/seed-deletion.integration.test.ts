import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  cashEntries,
  coldStoreChargeAllocations,
  farmers,
  merchants,
  seedLots,
  seedStockEntries,
  seedStockEntryEditHistory,
  seedTransactionEditHistory,
  seedTransactionItems,
  seedTransactions,
} from "@shared/schema";
import { db, pool } from "./db";
import { storage } from "./storage";

const date = "2026-05-01";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

after(async () => {
  await pool.end();
});

test("seed deletion storage integration", async (t) => {
  const [merchant] = await db.insert(merchants).values({
    name: `seed-deletion-integration-${randomUUID()}`,
  }).returning({ id: merchants.id });
  const merchantId = merchant.id;
  const [otherMerchant] = await db.insert(merchants).values({
    name: `seed-deletion-isolation-${randomUUID()}`,
  }).returning({ id: merchants.id });
  const farmerIds = new Set<number>();
  const transactionIds = new Set<number>();
  const stockEntryIds = new Set<number>();
  const cashEntryIds = new Set<number>();
  let nextTransactionNumber = 1;
  let nextSerialNumber = 1;

  const farmer = async (name: string, contact: string | null, village: string | null) => {
    const [row] = await db.insert(farmers).values({
      merchantId,
      dateAdded: date,
      name,
      contact,
      village,
    }).returning();
    farmerIds.add(row.id);
    return row;
  };

  const transaction = async (options: {
    farmerId?: number | null;
    farmerName?: string;
    farmerContact?: string | null;
    village?: string | null;
    due?: string;
    totalBags?: number;
  } = {}) => {
    const [row] = await db.insert(seedTransactions).values({
      merchantId,
      transactionNumber: nextTransactionNumber++,
      farmerId: options.farmerId ?? null,
      farmerName: options.farmerName ?? "Seed farmer",
      farmerContact: options.farmerContact ?? null,
      village: options.village ?? null,
      totalBags: options.totalBags ?? 1,
      totalRevenue: options.due ?? "100.00",
      totalDueToFarmer: options.due ?? "100.00",
    }).returning();
    transactionIds.add(row.id);
    return row;
  };

  const stockEntry = async (supplierName: string, amountPaid = "0.00") => {
    const [row] = await db.insert(seedStockEntries).values({
      merchantId,
      serialNumber: nextSerialNumber++,
      purchaseDate: date,
      supplierName,
      district: "Test district",
      state: "Test state",
      amountPaid,
      paymentStatus: Number(amountPaid) > 0 ? "partial" : "due",
    }).returning();
    stockEntryIds.add(row.id);
    return row;
  };

  const lot = async (entryId: number, options: {
    originalBags?: number;
    soldBags?: number;
    remainingBags?: number;
    coldStoreName?: string;
    coldStoreDbId?: number | null;
    coldStoreChargesPerBag?: string;
    coldStoreChargesPaid?: string;
  } = {}) => {
    const [row] = await db.insert(seedLots).values({
      seedEntryId: entryId,
      merchantId,
      coldStoreName: options.coldStoreName ?? "Test Cold Store",
      coldStoreDbId: options.coldStoreDbId ?? null,
      originalBags: options.originalBags ?? 10,
      potatoType: "Jyoti",
      bagType: "Wafer",
      size: "Medium",
      pricePerBag: "50.00",
      coldStoreChargesPerBag: options.coldStoreChargesPerBag ?? "0.00",
      coldStoreChargesPaid: options.coldStoreChargesPaid ?? "0.00",
      remainingBags: options.remainingBags ?? options.originalBags ?? 10,
      soldBags: options.soldBags ?? 0,
    }).returning();
    return row;
  };

  const saleItem = async (transactionId: number, lotId: number, bagsMoved: number) => {
    return db.insert(seedTransactionItems).values({
      seedTransactionId: transactionId,
      merchantId,
      seedLotId: lotId,
      serialNumber: 1,
      coldStoreName: "Test Cold Store",
      potatoType: "Jyoti",
      size: "Medium",
      bagType: "Wafer",
      bagsMoved,
      pricePerBag: "60.00",
      costPerBag: "50.00",
      revenue: (bagsMoved * 60).toFixed(2),
      cost: (bagsMoved * 50).toFixed(2),
      profitLoss: (bagsMoved * 10).toFixed(2),
    }).returning();
  };

  const cash = async (values: {
    direction?: string;
    revenueType?: string | null;
    expenseType?: string | null;
    farmerId?: number | null;
    farmerName?: string | null;
    farmerContact?: string | null;
    farmerVillage?: string | null;
    supplierName?: string | null;
    coldStoreName?: string | null;
    coldStoreDbId?: number | null;
    amount?: string;
    pettyAdjustment?: string;
    targets?: unknown;
    isReversed?: boolean;
  } = {}) => {
    const [row] = await db.insert(cashEntries).values({
      merchantId,
      direction: values.direction ?? "inward",
      receiptType: "cash_received",
      revenueType: values.revenueType ?? "seed_sale",
      expenseType: values.expenseType ?? null,
      farmerId: values.farmerId ?? null,
      farmerName: values.farmerName ?? "Seed farmer",
      farmerContact: values.farmerContact ?? null,
      farmerVillage: values.farmerVillage ?? null,
      supplierName: values.supplierName ?? null,
      coldStoreName: values.coldStoreName ?? null,
      coldStoreDbId: values.coldStoreDbId ?? null,
      amount: values.amount ?? "10.00",
      pettyAdjustment: values.pettyAdjustment ?? "0.00",
      seedSettlementTargets: values.targets as any,
      entryDate: date,
      isReversed: values.isReversed ?? false,
    }).returning();
    cashEntryIds.add(row.id);
    return row;
  };

  const assertDeletionCode = async (operation: () => Promise<unknown>, code: string) => {
    await assert.rejects(operation, (error: any) => {
      assert.equal(error.code, code);
      return true;
    });
  };

  // Hold the same per-merchant advisory lock as writes/deletions, then verify a
  // storage operation remains blocked until the gate is released.
  const withSeedLockGate = async (
    firstOperation: () => Promise<unknown>,
    secondOperation: () => Promise<unknown>,
  ) => {
    let acquired!: () => void;
    let release!: () => void;
    const hasLock = new Promise<void>((resolve) => { acquired = resolve; });
    const waitForRelease = new Promise<void>((resolve) => { release = resolve; });
    const gate = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(14501, ${merchantId})`);
      acquired();
      await waitForRelease;
    });
    await hasLock;
    let firstCompleted = false;
    let secondCompleted = false;
    const first = firstOperation().finally(() => { firstCompleted = true; });
    await delay(75);
    const second = secondOperation().finally(() => { secondCompleted = true; });
    try {
      await delay(75);
      assert.equal(firstCompleted, false, "first operation should wait for the merchant seed-activity lock");
      assert.equal(secondCompleted, false, "second operation should wait for the merchant seed-activity lock");
    } finally {
      release();
    }
    await gate;
    return Promise.allSettled([first, second]);
  };

  const runSeedWriteFirstThenSecond = async (
    firstOperation: (scopedStorage: any) => Promise<unknown>,
    secondOperation: () => Promise<unknown>,
  ) => {
    let firstFinished!: () => void;
    let release!: () => void;
    const firstIsFinished = new Promise<void>((resolve) => { firstFinished = resolve; });
    const waitForRelease = new Promise<void>((resolve) => { release = resolve; });
    const first = (storage as any).withSeedWriteTransaction(merchantId, async (scopedStorage: any) => {
      try {
        await firstOperation(scopedStorage);
      } finally {
        firstFinished();
        await waitForRelease;
      }
    });
    await firstIsFinished;
    let secondCompleted = false;
    const second = secondOperation().finally(() => { secondCompleted = true; });
    try {
      await delay(75);
      assert.equal(secondCompleted, false, "second write must wait for the first scoped seed transaction");
    } finally {
      release();
    }
    await Promise.all([first, second]);
  };

  const transactionItemValues = (seedLot: Awaited<ReturnType<typeof lot>>, serialNumber: number, bagsMoved: number) => ({
    merchantId,
    seedLotId: seedLot.id,
    serialNumber,
    coldStoreName: seedLot.coldStoreName,
    potatoType: seedLot.potatoType,
    size: seedLot.size,
    bagType: seedLot.bagType,
    bagsMoved,
    pricePerBag: "60.00",
    costPerBag: "50.00",
    revenue: (bagsMoved * 60).toFixed(2),
    cost: (bagsMoved * 50).toFixed(2),
    profitLoss: (bagsMoved * 10).toFixed(2),
  });

  try {
    await t.test("deleting an unpaid sale rebuilds lot counts from remaining history and removes its history", async () => {
      const entry = await stockEntry("History supplier");
      const seedLot = await lot(entry.id, { originalBags: 10, soldBags: 99, remainingBags: 0 });
      const removed = await transaction({ totalBags: 3 });
      const retained = await transaction({ totalBags: 2 });
      await saleItem(removed.id, seedLot.id, 3);
      await saleItem(retained.id, seedLot.id, 2);
      await db.insert(seedTransactionEditHistory).values({
        seedTransactionId: removed.id,
        merchantId,
        changeSet: [{ field: "totalBags", oldValue: "4", newValue: "3" }],
      });

      await storage.deleteSeedTransaction(removed.id, merchantId);

      const [updatedLot] = await db.select().from(seedLots).where(eq(seedLots.id, seedLot.id));
      assert.equal(updatedLot.soldBags, 2);
      assert.equal(updatedLot.remainingBags, 8);
      assert.equal((await db.select().from(seedTransactionItems)
        .where(eq(seedTransactionItems.seedTransactionId, removed.id))).length, 0);
      assert.equal((await db.select().from(seedTransactionEditHistory)
        .where(eq(seedTransactionEditHistory.seedTransactionId, removed.id))).length, 0);
      assert.equal((await db.select().from(seedTransactions)
        .where(eq(seedTransactions.id, removed.id))).length, 0);
      assert.equal((await db.select().from(seedTransactionItems)
        .where(eq(seedTransactionItems.seedTransactionId, retained.id))).length, 1);
    });

    await t.test("active target cash and petty-only receipts block deletion; reversing preserves cash audit", async () => {
      const farmerRow = await farmer("Targeted farmer", "9000000001", "North");
      const targetSale = await transaction({
        due: "95.00",
        farmerId: farmerRow.id,
        farmerName: farmerRow.name,
        farmerContact: farmerRow.contact,
        village: farmerRow.village,
      });
      const linkedReceipt = await cash({
        farmerId: farmerRow.id,
        farmerName: farmerRow.name,
        farmerContact: farmerRow.contact,
        farmerVillage: farmerRow.village,
        targets: [{ seedTransactionId: targetSale.id, amount: "5.00", pettyAdjustment: "0.00" }],
      });
      await assertDeletionCode(() => storage.deleteSeedTransaction(targetSale.id, merchantId), "SEED_PAYMENT_ACTIVE");
      const [targetSaleAfterBlock] = await db.select().from(seedTransactions)
        .where(eq(seedTransactions.id, targetSale.id));
      assert.equal(targetSaleAfterBlock.totalDueToFarmer, "95.00");

      const pettySale = await transaction({
        due: "98.00",
        farmerId: farmerRow.id,
        farmerName: farmerRow.name,
        farmerContact: farmerRow.contact,
        village: farmerRow.village,
      });
      const pettyReceipt = await cash({
        farmerId: farmerRow.id,
        farmerName: farmerRow.name,
        farmerContact: farmerRow.contact,
        farmerVillage: farmerRow.village,
        amount: "0.00",
        pettyAdjustment: "2.00",
        targets: [{ seedTransactionId: pettySale.id, amount: "0.00", pettyAdjustment: "2.00" }],
      });
      await assertDeletionCode(() => storage.deleteSeedTransaction(pettySale.id, merchantId), "SEED_PAYMENT_ACTIVE");
      const [pettySaleAfterBlock] = await db.select().from(seedTransactions)
        .where(eq(seedTransactions.id, pettySale.id));
      assert.equal(pettySaleAfterBlock.totalDueToFarmer, "98.00");

      await storage.reverseCashEntry(linkedReceipt.id, merchantId);
      await storage.deleteSeedTransaction(targetSale.id, merchantId);
      const [auditReceipt] = await db.select().from(cashEntries).where(eq(cashEntries.id, linkedReceipt.id));
      assert.equal(auditReceipt.isReversed, true);
      assert.deepEqual(auditReceipt.seedSettlementTargets, [{
        seedTransactionId: targetSale.id,
        amount: "5.00",
        pettyAdjustment: "0.00",
      }]);
      await storage.reverseCashEntry(pettyReceipt.id, merchantId);
      await storage.deleteSeedTransaction(pettySale.id, merchantId);
      const [pettyAudit] = await db.select().from(cashEntries).where(eq(cashEntries.id, pettyReceipt.id));
      assert.equal(pettyAudit.isReversed, true);
      assert.deepEqual(pettyAudit.seedSettlementTargets, [{
        seedTransactionId: pettySale.id,
        amount: "0.00",
        pettyAdjustment: "2.00",
      }]);
    });

    await t.test("explicit farmer receivable targets do not block an unrelated sale", async () => {
      const farmerRow = await farmer("Receivable-only farmer", "9000000010", "South");
      const sale = await transaction({
        farmerId: farmerRow.id,
        farmerName: farmerRow.name,
        farmerContact: farmerRow.contact,
        village: farmerRow.village,
      });
      const receivableReceipt = await cash({
        farmerId: farmerRow.id,
        farmerName: farmerRow.name,
        farmerContact: farmerRow.contact,
        farmerVillage: farmerRow.village,
        targets: [{ farmerId: farmerRow.id, amount: "10.00", pettyAdjustment: "0.00" }],
      });

      await storage.deleteSeedTransaction(sale.id, merchantId);
      assert.equal((await db.select().from(seedTransactions).where(eq(seedTransactions.id, sale.id))).length, 0);
      const [farmerAfter] = await db.select().from(farmers).where(eq(farmers.id, farmerRow.id));
      assert.equal(farmerAfter.remainingReceivable, "0.00");
      const [receiptAfter] = await db.select().from(cashEntries).where(eq(cashEntries.id, receivableReceipt.id));
      assert.equal(receiptAfter.isReversed, false);
      assert.deepEqual(receiptAfter.seedSettlementTargets, [{
        farmerId: farmerRow.id,
        amount: "10.00",
        pettyAdjustment: "0.00",
      }]);
    });

    await t.test("legacy null destinations match farmer identity without blocking a same-name farmer ID", async () => {
      const firstFarmer = await farmer("Same Name", "9000000002", "Village A");
      const secondFarmer = await farmer("Same Name", "9000000003", "Village B");
      const firstSale = await transaction({
        farmerId: firstFarmer.id,
        farmerName: firstFarmer.name,
        farmerContact: firstFarmer.contact,
        village: firstFarmer.village,
      });
      const secondSale = await transaction({
        farmerId: secondFarmer.id,
        farmerName: secondFarmer.name,
        farmerContact: secondFarmer.contact,
        village: secondFarmer.village,
      });
      const legacyReceipt = await cash({
        farmerId: firstFarmer.id,
        farmerName: firstFarmer.name,
        farmerContact: firstFarmer.contact,
        farmerVillage: firstFarmer.village,
        targets: null,
      });

      await assertDeletionCode(() => storage.deleteSeedTransaction(firstSale.id, merchantId), "SEED_PAYMENT_ACTIVE");
      const [firstSaleAfterBlock] = await db.select().from(seedTransactions)
        .where(eq(seedTransactions.id, firstSale.id));
      assert.equal(firstSaleAfterBlock.totalDueToFarmer, "100.00");
      await storage.deleteSeedTransaction(secondSale.id, merchantId);
      const [secondSaleAfterDelete] = await db.select().from(seedTransactions)
        .where(eq(seedTransactions.id, secondSale.id));
      assert.equal(secondSaleAfterDelete, undefined);
      const [legacyReceiptAfterBlock] = await db.select().from(cashEntries)
        .where(eq(cashEntries.id, legacyReceipt.id));
      assert.equal(legacyReceiptAfterBlock.isReversed, false);

      const legacySale = await transaction({
        farmerName: "Legacy Composite",
        farmerContact: "9000000004",
        village: "Old village",
        due: "98.00",
      });
      const legacyPettyReceipt = await cash({
        amount: "0.00",
        pettyAdjustment: "2.00",
        farmerName: " Legacy Composite ",
        targets: null,
      });
      await assertDeletionCode(() => storage.deleteSeedTransaction(legacySale.id, merchantId), "SEED_PAYMENT_ACTIVE");
      const [legacySaleAfterBlock] = await db.select().from(seedTransactions)
        .where(eq(seedTransactions.id, legacySale.id));
      assert.equal(legacySaleAfterBlock.totalDueToFarmer, "98.00");
      assert.equal(legacyPettyReceipt.farmerId, null);
      assert.equal(legacyPettyReceipt.farmerContact, null);
      assert.equal(legacyPettyReceipt.farmerVillage, null);
    });

    await t.test("entry deletion is isolated by merchant and linked stock is protected even with zero bags and due", async () => {
      const entry = await stockEntry("Linked supplier");
      const seedLot = await lot(entry.id, { originalBags: 0, remainingBags: 0 });
      const zeroBagSale = await transaction({ totalBags: 0 });
      await saleItem(zeroBagSale.id, seedLot.id, 1);

      await assertDeletionCode(() => storage.deleteSeedEntry(entry.id, otherMerchant.id), "SEED_ENTRY_NOT_FOUND");
      await assertDeletionCode(() => storage.deleteSeedEntry(entry.id, merchantId), "SEED_TRANSACTIONS_LINKED");
      const [entryAfterBlock] = await db.select().from(seedStockEntries).where(eq(seedStockEntries.id, entry.id));
      const [lotAfterBlock] = await db.select().from(seedLots).where(eq(seedLots.id, seedLot.id));
      assert.equal(entryAfterBlock.amountPaid, "0.00");
      assert.equal(lotAfterBlock.remainingBags, 0);
      assert.equal(lotAfterBlock.soldBags, 0);
      assert.equal((await db.select().from(seedTransactionItems)
        .where(eq(seedTransactionItems.seedTransactionId, zeroBagSale.id))).length, 1);
    });

    await t.test("supplier paid fields and active supplier cash both block without mutation", async () => {
      const paidEntry = await stockEntry("Direct paid supplier", "1.00");
      const directPaidLot = await lot(paidEntry.id);
      await db.insert(seedStockEntryEditHistory).values({
        seedEntryId: paidEntry.id,
        merchantId,
        changeSet: [{ field: "amountPaid", oldValue: "0", newValue: "1" }],
      });
      await assertDeletionCode(() => storage.deleteSeedEntry(paidEntry.id, merchantId), "SEED_SUPPLIER_PAYMENT_ACTIVE");
      const [paidEntryAfterBlock] = await db.select().from(seedStockEntries)
        .where(eq(seedStockEntries.id, paidEntry.id));
      assert.equal(paidEntryAfterBlock.amountPaid, "1.00");
      assert.equal(paidEntryAfterBlock.paymentStatus, "partial");
      assert.equal((await db.select().from(seedLots).where(eq(seedLots.id, directPaidLot.id))).length, 1);
      assert.equal((await db.select().from(seedStockEntryEditHistory)
        .where(eq(seedStockEntryEditHistory.seedEntryId, paidEntry.id))).length, 1);

      const cashPaidEntry = await stockEntry("Active supplier cash");
      await lot(cashPaidEntry.id);
      const supplierReceipt = await cash({
        direction: "outflow",
        revenueType: null,
        expenseType: "supplier",
        supplierName: cashPaidEntry.supplierName,
        amount: "20.00",
      });
      await assertDeletionCode(() => storage.deleteSeedEntry(cashPaidEntry.id, merchantId), "SEED_SUPPLIER_PAYMENT_ACTIVE");
      const [cashPaidEntryAfterBlock] = await db.select().from(seedStockEntries)
        .where(eq(seedStockEntries.id, cashPaidEntry.id));
      assert.equal(cashPaidEntryAfterBlock.amountPaid, "0.00");
      assert.equal(cashPaidEntryAfterBlock.paymentStatus, "due");
      await storage.reverseCashEntry(supplierReceipt.id, merchantId);
      await storage.deleteSeedEntry(cashPaidEntry.id, merchantId);
      const [supplierAudit] = await db.select().from(cashEntries).where(eq(cashEntries.id, supplierReceipt.id));
      assert.equal(supplierAudit.isReversed, true);
    });

    await t.test("cold-store paid fields and active allocations block; reversal detaches allocation and retains audit", async () => {
      const directEntry = await stockEntry("Direct cold-store paid");
      const directLot = await lot(directEntry.id, { coldStoreChargesPaid: "1.00" });
      await assertDeletionCode(() => storage.deleteSeedEntry(directEntry.id, merchantId), "SEED_COLD_STORE_PAYMENT_ACTIVE");
      const [directLotAfterBlock] = await db.select().from(seedLots).where(eq(seedLots.id, directLot.id));
      assert.equal(directLotAfterBlock.coldStoreChargesPaid, "1.00");

      const allocatedEntry = await stockEntry("Allocated cold-store");
      const allocatedLot = await lot(allocatedEntry.id, {
        originalBags: 2,
        coldStoreChargesPerBag: "10.00",
        coldStoreName: "Allocation Cold Store",
      });
      const receipt = await cash({
        direction: "outflow",
        revenueType: null,
        expenseType: "cold_store_charge",
        coldStoreName: "Allocation Cold Store",
        coldStoreDbId: 987654,
        amount: "5.00",
      });
      const [allocation] = await db.insert(coldStoreChargeAllocations).values({
        cashEntryId: receipt.id,
        seedLotId: allocatedLot.id,
        merchantId,
        appliedAmount: "5.00",
        pettyAdjustment: "0.00",
      }).returning();
      await assertDeletionCode(() => storage.deleteSeedEntry(allocatedEntry.id, merchantId), "SEED_COLD_STORE_PAYMENT_ACTIVE");
      const [allocatedLotAfterBlock] = await db.select().from(seedLots)
        .where(eq(seedLots.id, allocatedLot.id));
      assert.equal(allocatedLotAfterBlock.coldStoreChargesPaid, "0.00");
      assert.equal((await db.select().from(coldStoreChargeAllocations)
        .where(eq(coldStoreChargeAllocations.id, allocation.id))).length, 1);

      await storage.reverseCashEntry(receipt.id, merchantId);
      await storage.deleteSeedEntry(allocatedEntry.id, merchantId);
      const [detachedAllocation] = await db.select().from(coldStoreChargeAllocations)
        .where(eq(coldStoreChargeAllocations.id, allocation.id));
      assert.equal(detachedAllocation.seedLotId, null);
      assert.equal((await db.select().from(seedLots).where(eq(seedLots.id, allocatedLot.id))).length, 0);
      const [retainedReceipt] = await db.select().from(cashEntries).where(eq(cashEntries.id, receipt.id));
      assert.equal(retainedReceipt.isReversed, true);
      assert.equal((await db.select().from(coldStoreChargeAllocations)
        .where(eq(coldStoreChargeAllocations.id, allocation.id))).length, 1);
    });

    await t.test("legacy cold-store payments without allocations block matching lots without mutation", async () => {
      const entry = await stockEntry("Legacy cold-store supplier");
      const seedLot = await lot(entry.id, {
        coldStoreName: "Legacy Cold Store",
        coldStoreDbId: null,
      });
      const legacyReceipt = await cash({
        direction: "outflow",
        revenueType: null,
        expenseType: "cold_store_charge",
        coldStoreName: "Legacy Cold Store",
        amount: "7.00",
      });

      await assertDeletionCode(() => storage.deleteSeedEntry(entry.id, merchantId), "SEED_COLD_STORE_PAYMENT_ACTIVE");
      const [entryAfterBlock] = await db.select().from(seedStockEntries).where(eq(seedStockEntries.id, entry.id));
      const [lotAfterBlock] = await db.select().from(seedLots).where(eq(seedLots.id, seedLot.id));
      assert.equal(entryAfterBlock.amountPaid, "0.00");
      assert.equal(lotAfterBlock.coldStoreChargesPaid, "0.00");
      assert.equal(lotAfterBlock.remainingBags, 10);
      assert.equal((await db.select().from(seedStockEntries).where(eq(seedStockEntries.id, entry.id))).length, 1);
      assert.equal((await db.select().from(coldStoreChargeAllocations)
        .where(eq(coldStoreChargeAllocations.cashEntryId, legacyReceipt.id))).length, 0);
    });

    await t.test("successful stock deletion removes edit history and permits next and reused serials", async () => {
      const deletedEntry = await stockEntry("Deleted serial supplier");
      await db.insert(seedStockEntryEditHistory).values({
        seedEntryId: deletedEntry.id,
        merchantId,
        changeSet: [{ field: "remarks", oldValue: null, newValue: "updated" }],
      });
      await storage.deleteSeedEntry(deletedEntry.id, merchantId);
      assert.equal((await db.select().from(seedStockEntryEditHistory)
        .where(eq(seedStockEntryEditHistory.seedEntryId, deletedEntry.id))).length, 0);
      assert.equal((await db.select().from(seedStockEntries)
        .where(eq(seedStockEntries.id, deletedEntry.id))).length, 0);

      const expectedNextSerial = await storage.getNextSeedSerialNumberForYear(merchantId, 2026);
      const automaticEntry = await storage.createSeedEntry({
        merchantId,
        purchaseDate: date,
        supplierName: "Automatic serial supplier",
        district: "Test district",
        state: "Test state",
      } as any);
      stockEntryIds.add(automaticEntry.id);
      assert.equal(automaticEntry.serialNumber, expectedNextSerial);

      const reusedEntry = await storage.createSeedEntry({
        merchantId,
        serialNumber: deletedEntry.serialNumber,
        purchaseDate: date,
        supplierName: "Reused serial supplier",
        district: "Test district",
        state: "Test state",
      } as any);
      stockEntryIds.add(reusedEntry.id);
      assert.equal(reusedEntry.serialNumber, deletedEntry.serialNumber);
    });

    await t.test("seed-sale payment and sale deletion serialize on the shared activity lock", async () => {
      const farmerRow = await farmer("Concurrent sale farmer", "9000000005", "Concurrent");
      const sale = await transaction({
        farmerId: farmerRow.id,
        farmerName: farmerRow.name,
        farmerContact: farmerRow.contact,
        village: farmerRow.village,
      });
      const outcomes = await withSeedLockGate(
        () => storage.createCashEntryWithFIFO({
          merchantId,
          direction: "inward",
          receiptType: "cash_received",
          revenueType: "seed_sale",
          farmerId: farmerRow.id,
          farmerName: farmerRow.name,
          farmerContact: farmerRow.contact,
          farmerVillage: farmerRow.village,
          amount: "10.00",
          pettyAdjustment: "0.00",
          entryDate: date,
        } as any, true),
        () => storage.deleteSeedTransaction(sale.id, merchantId),
      );
      assert.equal(outcomes[0].status, "fulfilled");
      assert.equal(outcomes[1].status, "rejected");
      assert.equal((outcomes[1] as PromiseRejectedResult).reason.code, "SEED_PAYMENT_ACTIVE");
      assert.equal((await db.select().from(seedTransactions).where(eq(seedTransactions.id, sale.id))).length, 1);
    });

    await t.test("supplier payment and entry deletion serialize on the shared activity lock", async () => {
      const entry = await stockEntry("Concurrent supplier");
      await lot(entry.id);
      const outcomes = await withSeedLockGate(() => storage.createCashEntry({
        merchantId,
        direction: "outflow",
        expenseType: "supplier",
        supplierName: entry.supplierName,
        paymentMode: "cash",
        amount: "1.00",
        pettyAdjustment: "0.00",
        entryDate: date,
      } as any, true), () => storage.deleteSeedEntry(entry.id, merchantId));
      assert.equal(outcomes[0].status, "fulfilled");
      assert.equal(outcomes[1].status, "rejected");
      assert.equal((outcomes[1] as PromiseRejectedResult).reason.code, "SEED_SUPPLIER_PAYMENT_ACTIVE");
      assert.equal((await db.select().from(seedStockEntries).where(eq(seedStockEntries.id, entry.id))).length, 1);
    });

    await t.test("cold-store payment and entry deletion serialize on the shared activity lock", async () => {
      const entry = await stockEntry("Concurrent cold-store");
      const seedLot = await lot(entry.id, {
        coldStoreChargesPerBag: "10.00",
        coldStoreName: "Concurrent Cold Store",
      });
      const outcomes = await withSeedLockGate(() => storage.createCashEntry({
        merchantId,
        direction: "outflow",
        expenseType: "cold_store_charge",
        coldStoreName: "Concurrent Cold Store",
        coldStoreDbId: 123456,
        paymentMode: "cash",
        amount: "1.00",
        pettyAdjustment: "0.00",
        entryDate: date,
      } as any, false, undefined, undefined, undefined, [{
        seedLotId: seedLot.id,
        amount: 1,
        pettyAdjustment: 0,
        isPyPayable: false,
      }]), () => storage.deleteSeedEntry(entry.id, merchantId));
      assert.equal(outcomes[0].status, "fulfilled");
      assert.equal(outcomes[1].status, "rejected");
      assert.equal((outcomes[1] as PromiseRejectedResult).reason.code, "SEED_COLD_STORE_PAYMENT_ACTIVE");
      assert.equal((await db.select().from(seedStockEntries).where(eq(seedStockEntries.id, entry.id))).length, 1);
    });

    await t.test("sale creation and stock-entry deletion serialize on the shared activity lock", async () => {
      const entry = await stockEntry("Concurrent sale stock");
      const seedLot = await lot(entry.id);
      const outcomes = await withSeedLockGate(() => storage.createSeedTransaction({
        merchantId,
        transactionNumber: nextTransactionNumber++,
        farmerId: null,
        farmerName: "Concurrent creation",
        totalBags: 1,
        totalRevenue: "60.00",
        totalDueToFarmer: "60.00",
      } as any, [{
        merchantId,
        seedLotId: seedLot.id,
        serialNumber: entry.serialNumber,
        coldStoreName: seedLot.coldStoreName,
        potatoType: seedLot.potatoType,
        size: seedLot.size,
        bagType: seedLot.bagType,
        bagsMoved: 1,
        pricePerBag: "60.00",
        costPerBag: "50.00",
        revenue: "60.00",
        cost: "50.00",
        profitLoss: "10.00",
      } as any]), () => storage.deleteSeedEntry(entry.id, merchantId));
      assert.equal(outcomes[0].status, "fulfilled");
      assert.equal(outcomes[1].status, "rejected");
      assert.equal((outcomes[1] as PromiseRejectedResult).reason.code, "SEED_TRANSACTIONS_LINKED");
      assert.equal((await db.select().from(seedStockEntries).where(eq(seedStockEntries.id, entry.id))).length, 1);
      assert.equal((await db.select().from(seedLots).where(eq(seedLots.id, seedLot.id))).length, 1);
    });

    await t.test("after sale deletion, seed payment fails and rolls back its cash row", async () => {
      const farmerRow = await farmer("Deleted sale payment", "9000000011", "No sales");
      const sale = await transaction({
        farmerId: farmerRow.id,
        farmerName: farmerRow.name,
        farmerContact: farmerRow.contact,
        village: farmerRow.village,
      });
      await storage.deleteSeedTransaction(sale.id, merchantId);
      const [deletedSale] = await db.select().from(seedTransactions).where(eq(seedTransactions.id, sale.id));
      assert.equal(deletedSale, undefined);
      const beforeCashCount = (await db.select({ id: cashEntries.id }).from(cashEntries)
        .where(eq(cashEntries.merchantId, merchantId))).length;

      await assert.rejects(storage.createCashEntryWithFIFO({
        merchantId,
        direction: "inward",
        receiptType: "cash_received",
        revenueType: "seed_sale",
        farmerId: farmerRow.id,
        farmerName: farmerRow.name,
        farmerContact: farmerRow.contact,
        farmerVillage: farmerRow.village,
        amount: "10.00",
        pettyAdjustment: "0.00",
        entryDate: date,
      } as any, true));
      const afterCashCount = (await db.select({ id: cashEntries.id }).from(cashEntries)
        .where(eq(cashEntries.merchantId, merchantId))).length;
      assert.equal(afterCashCount, beforeCashCount);
      assert.equal((await db.select().from(seedTransactions).where(eq(seedTransactions.id, sale.id))).length, 0);
    });

    await t.test("after stock deletion, sale creation from a stale lot fails and rolls back the sale", async () => {
      const entry = await stockEntry("Already deleted sale stock");
      const seedLot = await lot(entry.id);
      await storage.deleteSeedEntry(entry.id, merchantId);
      assert.equal((await db.select().from(seedStockEntries).where(eq(seedStockEntries.id, entry.id))).length, 0);
      assert.equal((await db.select().from(seedLots).where(eq(seedLots.id, seedLot.id))).length, 0);
      const beforeTransactionCount = (await db.select({ id: seedTransactions.id }).from(seedTransactions)
        .where(eq(seedTransactions.merchantId, merchantId))).length;

      await assert.rejects(storage.createSeedTransaction({
        merchantId,
        transactionNumber: nextTransactionNumber++,
        farmerId: null,
        farmerName: "Stale stock sale",
        totalBags: 1,
        totalRevenue: "60.00",
        totalDueToFarmer: "60.00",
      } as any, [{
        merchantId,
        seedLotId: seedLot.id,
        serialNumber: entry.serialNumber,
        coldStoreName: seedLot.coldStoreName,
        potatoType: seedLot.potatoType,
        size: seedLot.size,
        bagType: seedLot.bagType,
        bagsMoved: 1,
        pricePerBag: "60.00",
        costPerBag: "50.00",
        revenue: "60.00",
        cost: "50.00",
        profitLoss: "10.00",
      } as any]));
      const afterTransactionCount = (await db.select({ id: seedTransactions.id }).from(seedTransactions)
        .where(eq(seedTransactions.merchantId, merchantId))).length;
      assert.equal(afterTransactionCount, beforeTransactionCount);
      assert.equal((await db.select().from(seedTransactionItems)
        .where(eq(seedTransactionItems.seedLotId, seedLot.id))).length, 0);
    });

    await t.test("deleting sale A and editing sale B on one lot serialize correctly in both orderings", async () => {
      const runOrdering = async (deleteFirst: boolean) => {
        const entry = await stockEntry(`Sale edit race ${deleteFirst ? "delete" : "edit"} first`);
        const seedLot = await lot(entry.id, {
          originalBags: 20,
          soldBags: 7,
          remainingBags: 13,
        });
        const saleA = await transaction({ totalBags: 3, farmerName: `Concurrent sale A ${entry.id}` });
        const saleB = await transaction({ totalBags: 4, farmerName: `Concurrent sale B ${entry.id}` });
        await saleItem(saleA.id, seedLot.id, 3);
        await saleItem(saleB.id, seedLot.id, 4);

        const deleteA = (scopedStorage: any) => scopedStorage.deleteSeedTransaction(saleA.id, merchantId);
        const editB = (scopedStorage: any) => scopedStorage.updateSeedTransaction(
          saleB.id,
          merchantId,
          { totalBags: 6 },
          [transactionItemValues(seedLot, entry.serialNumber, 6)],
        );
        await runSeedWriteFirstThenSecond(
          deleteFirst ? deleteA : editB,
          deleteFirst
            ? () => (storage as any).updateSeedTransaction(
              saleB.id,
              merchantId,
              { totalBags: 6 },
              [transactionItemValues(seedLot, entry.serialNumber, 6)],
            )
            : () => storage.deleteSeedTransaction(saleA.id, merchantId),
        );

        const [lotAfter] = await db.select().from(seedLots).where(eq(seedLots.id, seedLot.id));
        const survivingItems = await db.select().from(seedTransactionItems)
          .where(and(eq(seedTransactionItems.merchantId, merchantId), eq(seedTransactionItems.seedLotId, seedLot.id)));
        const survivingSold = survivingItems.reduce((sum, item) => sum + item.bagsMoved, 0);
        assert.equal((await db.select().from(seedTransactions).where(eq(seedTransactions.id, saleA.id))).length, 0);
        assert.equal((await db.select().from(seedTransactions).where(eq(seedTransactions.id, saleB.id))).length, 1);
        assert.equal(survivingItems.length, 1);
        assert.equal(survivingItems[0].seedTransactionId, saleB.id);
        assert.equal(survivingItems[0].bagsMoved, 6);
        assert.equal(lotAfter.soldBags, survivingSold);
        assert.equal(lotAfter.soldBags, 6);
        assert.equal(lotAfter.remainingBags, lotAfter.originalBags - survivingSold);
        assert.equal(lotAfter.remainingBags, 14);
        const pickerLot = (await storage.getAllSeedLotsByMerchant(merchantId))
          .find((candidate) => candidate.id === seedLot.id);
        assert.equal(pickerLot?.remainingBags, 14);
        assert.ok((pickerLot?.remainingBags ?? 0) > 0, "the picker should expose the lot's remaining 14 bags");
      };

      await runOrdering(true);
      await runOrdering(false);
    });

    await t.test("deleting a sale and editing its stock lot serialize correctly in both orderings", async () => {
      const runOrdering = async (deleteFirst: boolean) => {
        const entry = await stockEntry(`Stock edit race ${deleteFirst ? "delete" : "edit"} first`);
        const seedLot = await lot(entry.id, {
          originalBags: 20,
          soldBags: 7,
          remainingBags: 13,
        });
        const saleA = await transaction({ totalBags: 3, farmerName: `Concurrent stock sale A ${entry.id}` });
        const saleB = await transaction({ totalBags: 4, farmerName: `Concurrent stock sale B ${entry.id}` });
        await saleItem(saleA.id, seedLot.id, 3);
        await saleItem(saleB.id, seedLot.id, 4);

        const deleteSale = (scopedStorage: any) =>
          scopedStorage.deleteSeedTransaction(saleA.id, merchantId);
        const editStock = async (scopedStorage: any) => {
          const currentEntry = await scopedStorage.getSeedEntryById(entry.id, merchantId);
          assert.ok(currentEntry);
          const currentLot = currentEntry.seedLots.find((candidate: any) => candidate.id === seedLot.id);
          assert.ok(currentLot);
          await scopedStorage.updateSeedLot(seedLot.id, merchantId, {
            originalBags: 25,
            remainingBags: 25 - currentLot.soldBags,
          });
        };
        await runSeedWriteFirstThenSecond(
          deleteFirst ? deleteSale : editStock,
          deleteFirst
            ? () => (storage as any).withSeedWriteTransaction(merchantId, editStock)
            : () => storage.deleteSeedTransaction(saleA.id, merchantId),
        );

        const [lotAfter] = await db.select().from(seedLots).where(eq(seedLots.id, seedLot.id));
        const survivingItems = await db.select().from(seedTransactionItems)
          .where(and(eq(seedTransactionItems.merchantId, merchantId), eq(seedTransactionItems.seedLotId, seedLot.id)));
        const survivingSold = survivingItems.reduce((sum, item) => sum + item.bagsMoved, 0);
        assert.equal((await db.select().from(seedTransactions).where(eq(seedTransactions.id, saleA.id))).length, 0);
        assert.equal((await db.select().from(seedTransactions).where(eq(seedTransactions.id, saleB.id))).length, 1);
        assert.equal(survivingSold, 4);
        assert.equal(lotAfter.originalBags, 25);
        assert.equal(lotAfter.soldBags, survivingSold);
        assert.equal(lotAfter.remainingBags, lotAfter.originalBags - survivingSold);
        assert.equal(lotAfter.remainingBags, 21);
        const pickerLot = (await storage.getAllSeedLotsByMerchant(merchantId))
          .find((candidate) => candidate.id === seedLot.id);
        assert.equal(pickerLot?.remainingBags, 21);
        assert.ok((pickerLot?.remainingBags ?? 0) > 0, "the picker should expose the lot's remaining 21 bags");
      };

      await runOrdering(true);
      await runOrdering(false);
    });

    await t.test("invalid seed transaction edit rolls back item and inventory changes", async () => {
      const entry = await stockEntry("Invalid edit rollback");
      const seedLot = await lot(entry.id, {
        originalBags: 10,
        soldBags: 2,
        remainingBags: 8,
      });
      const sale = await transaction({ totalBags: 2 });
      await saleItem(sale.id, seedLot.id, 2);
      const [lotBefore] = await db.select().from(seedLots).where(eq(seedLots.id, seedLot.id));
      const [saleBefore] = await db.select().from(seedTransactions).where(eq(seedTransactions.id, sale.id));
      const itemsBefore = await db.select().from(seedTransactionItems)
        .where(eq(seedTransactionItems.seedTransactionId, sale.id));

      await assert.rejects((storage as any).updateSeedTransaction(
        sale.id,
        merchantId,
        { totalBags: 9 },
        [transactionItemValues({ ...seedLot, id: -999999 } as any, entry.serialNumber, 9)],
      ));

      const [lotAfter] = await db.select().from(seedLots).where(eq(seedLots.id, seedLot.id));
      const [saleAfter] = await db.select().from(seedTransactions).where(eq(seedTransactions.id, sale.id));
      const itemsAfter = await db.select().from(seedTransactionItems)
        .where(eq(seedTransactionItems.seedTransactionId, sale.id));
      assert.equal(lotAfter.soldBags, lotBefore.soldBags);
      assert.equal(lotAfter.remainingBags, lotBefore.remainingBags);
      assert.equal(saleAfter.totalBags, saleBefore.totalBags);
      assert.deepEqual(itemsAfter.map((item) => ({
        seedLotId: item.seedLotId,
        bagsMoved: item.bagsMoved,
      })), itemsBefore.map((item) => ({
        seedLotId: item.seedLotId,
        bagsMoved: item.bagsMoved,
      })));
    });
  } finally {
    // Clean only fixture-owned merchant rows. Child records are removed before
    // their parents so the integration test cannot affect other tenant data.
    await db.delete(coldStoreChargeAllocations).where(eq(coldStoreChargeAllocations.merchantId, merchantId));
    await db.delete(cashEntries).where(eq(cashEntries.merchantId, merchantId));
    await db.delete(seedTransactionItems).where(eq(seedTransactionItems.merchantId, merchantId));
    await db.delete(seedTransactionEditHistory).where(eq(seedTransactionEditHistory.merchantId, merchantId));
    await db.delete(seedTransactions).where(eq(seedTransactions.merchantId, merchantId));
    await db.delete(seedStockEntryEditHistory).where(eq(seedStockEntryEditHistory.merchantId, merchantId));
    await db.delete(seedLots).where(eq(seedLots.merchantId, merchantId));
    await db.delete(seedStockEntries).where(eq(seedStockEntries.merchantId, merchantId));
    if (farmerIds.size) {
      await db.delete(farmers).where(and(
        eq(farmers.merchantId, merchantId),
      ));
    }
    await db.delete(merchants).where(eq(merchants.id, merchantId));
    await db.delete(merchants).where(eq(merchants.id, otherMerchant.id));
  }
});