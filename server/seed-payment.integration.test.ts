import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  cashEntries,
  farmers,
  merchants,
  seedTransactions,
} from "@shared/schema";
import { db, pool } from "./db";
import { storage } from "./storage";

const date = "2026-05-01";

after(async () => {
  await pool.end();
});

test("seed payment storage integration", async (t) => {
  const [merchant] = await db.insert(merchants).values({
    name: `seed-payment-integration-${randomUUID()}`,
  }).returning({ id: merchants.id });
  const merchantId = merchant.id;
  const farmerIds = new Set<number>();
  const seedTransactionIds = new Set<number>();
  const cashEntryIds = new Set<number>();
  let nextTransactionNumber = 1;

  const farmer = async (
    name: string,
    contact: string | null,
    village: string | null,
    remainingReceivable = "0.00",
  ) => {
    const [row] = await db.insert(farmers).values({
      merchantId,
      dateAdded: date,
      name,
      contact,
      village,
      remainingReceivable,
    }).returning();
    farmerIds.add(row.id);
    return row;
  };

  const seedTxn = async (
    farmerRow: typeof farmers.$inferSelect | null,
    name: string,
    contact: string | null,
    village: string | null,
    due: string,
    options: { totalRevenue?: string; createdAt?: Date } = {},
  ) => {
    const [row] = await db.insert(seedTransactions).values({
      merchantId,
      transactionNumber: nextTransactionNumber++,
      farmerId: farmerRow?.id ?? null,
      farmerName: name,
      farmerContact: contact,
      village,
      totalBags: 1,
      totalRevenue: options.totalRevenue ?? due,
      totalDueToFarmer: due,
      createdAt: options.createdAt,
    }).returning();
    seedTransactionIds.add(row.id);
    return row;
  };

  const pay = async (
    farmerRow: typeof farmers.$inferSelect,
    amount: string,
    pettyAdjustment = "0.00",
    method: "cash" | "fifo" = "cash",
    details: { receiptType?: string; chequeNumber?: string } = {},
  ) => {
    const entry = {
      merchantId,
      direction: "inward",
      receiptType: details.receiptType ?? "cash_received",
      revenueType: "seed_sale",
      farmerId: farmerRow.id,
      farmerName: farmerRow.name,
      farmerContact: farmerRow.contact,
      farmerVillage: farmerRow.village,
      amount,
      pettyAdjustment,
      chequeNumber: details.chequeNumber ?? null,
      entryDate: date,
    };
    const created = method === "fifo"
      ? await storage.createCashEntryWithFIFO(entry, true)
      : await storage.createCashEntry(entry, true);
    cashEntryIds.add(created.id);
    return created;
  };

  const due = async (id: number) => {
    const [row] = await db.select({ amount: seedTransactions.totalDueToFarmer })
      .from(seedTransactions)
      .where(and(eq(seedTransactions.id, id), eq(seedTransactions.merchantId, merchantId)));
    return row.amount;
  };

  const targets = async (id: number) => {
    const [row] = await db.select({ value: cashEntries.seedSettlementTargets })
      .from(cashEntries)
      .where(and(eq(cashEntries.id, id), eq(cashEntries.merchantId, merchantId)));
    return row.value;
  };

  try {
    await t.test("settles 63,000 cash plus 78 petty against 63,078 without inflating cash", async () => {
      const selected = await farmer("Full Due", "9000000001", "North");
      const txn = await seedTxn(selected, selected.name, selected.contact, selected.village, "63078.00");

      const entry = await pay(selected, "63000.00", "78.00", "cash", {
        receiptType: "account_received",
        chequeNumber: "INTEGRATION-CHEQUE",
      });

      assert.equal(entry.amount, "63000.00");
      assert.equal(entry.pettyAdjustment, "78.00");
      assert.equal(entry.receiptType, "account_received");
      assert.equal(entry.chequeNumber, "INTEGRATION-CHEQUE");
      assert.deepEqual(await targets(entry.id), [{
        seedTransactionId: txn.id,
        amount: "63000.00",
        pettyAdjustment: "78.00",
      }]);
      assert.equal(await due(txn.id), "0.00");
      const rows = await storage.getSeedFarmersWithDue(merchantId);
      assert.equal(rows.some((row) => row.farmerId === selected.id), false);
    });

    await t.test("supports petty-only cash settlement and uses receivable-first FIFO", async () => {
      const selected = await farmer("FIFO Farmer", "9000000002", "East", "20.00");
      const first = await seedTxn(selected, selected.name, selected.contact, selected.village, "100.00", {
        createdAt: new Date("2026-01-01T00:00:00Z"),
      });
      const second = await seedTxn(selected, selected.name, selected.contact, selected.village, "200.00", {
        createdAt: new Date("2026-01-02T00:00:00Z"),
      });

      const firstPayment = await pay(selected, "0.00", "150.00", "fifo");
      assert.equal(firstPayment.amount, "0.00");
      assert.equal(firstPayment.pettyAdjustment, "150.00");
      assert.deepEqual(await targets(firstPayment.id), [
        { farmerId: selected.id, amount: "0.00", pettyAdjustment: "20.00" },
        { seedTransactionId: first.id, amount: "0.00", pettyAdjustment: "100.00" },
        { seedTransactionId: second.id, amount: "0.00", pettyAdjustment: "30.00" },
      ]);
      const secondPayment = await pay(selected, "40.00");
      assert.deepEqual(await targets(secondPayment.id), [
        { seedTransactionId: second.id, amount: "40.00", pettyAdjustment: "0.00" },
      ]);

      const [farmerAfterPay] = await db.select({ balance: farmers.remainingReceivable })
        .from(farmers).where(eq(farmers.id, selected.id));
      assert.equal(farmerAfterPay.balance, "0.00");
      assert.equal(await due(first.id), "0.00");
      assert.equal(await due(second.id), "130.00");

      await storage.reverseCashEntry(firstPayment.id, merchantId);
      const [farmerAfterOutOfOrderReverse] = await db.select({ balance: farmers.remainingReceivable })
        .from(farmers).where(eq(farmers.id, selected.id));
      assert.equal(farmerAfterOutOfOrderReverse.balance, "20.00");
      assert.equal(await due(first.id), "100.00");
      assert.equal(await due(second.id), "160.00");

      await storage.reverseCashEntry(secondPayment.id, merchantId);
      assert.equal(await due(second.id), "200.00");

      const pettyOnly = await farmer("Petty Only", "9000000003", "West");
      const pettyTxn = await seedTxn(pettyOnly, pettyOnly.name, pettyOnly.contact, pettyOnly.village, "78.00");
      const pettyEntry = await pay(pettyOnly, "0.00", "78.00", "cash", { receiptType: "cash_received" });
      assert.equal(pettyEntry.amount, "0.00");
      assert.equal(pettyEntry.pettyAdjustment, "78.00");
      assert.equal(await due(pettyTxn.id), "0.00");
    });

    await t.test("isolates same-name farmer IDs and matches legacy seed transactions by composite identity", async () => {
      const firstFarmer = await farmer("Same Name", "9000000004", "Village A");
      const secondFarmer = await farmer("Same Name", "9000000005", "Village B");
      const firstTxn = await seedTxn(firstFarmer, firstFarmer.name, firstFarmer.contact, firstFarmer.village, "10.25");
      const legacyTxn = await seedTxn(null, firstFarmer.name, firstFarmer.contact, firstFarmer.village, "2.50");
      const secondTxn = await seedTxn(secondFarmer, secondFarmer.name, secondFarmer.contact, secondFarmer.village, "40.00");

      const farmerRows = await storage.getSeedFarmersWithDue(merchantId);
      assert.equal(farmerRows.find((row) => row.farmerId === firstFarmer.id)?.outstandingDue, "12.75");
      assert.equal(farmerRows.find((row) => row.farmerId === secondFarmer.id)?.outstandingDue, "40.00");

      const payment = await pay(firstFarmer, "12.75", "0.00", "fifo");
      assert.deepEqual(await targets(payment.id), [
        { seedTransactionId: firstTxn.id, amount: "10.25", pettyAdjustment: "0.00" },
        { seedTransactionId: legacyTxn.id, amount: "2.50", pettyAdjustment: "0.00" },
      ]);
      assert.equal(await due(firstTxn.id), "0.00");
      assert.equal(await due(legacyTxn.id), "0.00");
      assert.equal(await due(secondTxn.id), "40.00");
    });

    await t.test("reports fractional due to exact two-decimal precision", async () => {
      const selected = await farmer("Fractional", "9000000006", "South", "0.16");
      const txn = await seedTxn(selected, selected.name, selected.contact, selected.village, "1.23");
      const result = await storage.getSeedFarmersWithDue(merchantId);
      assert.equal(result.find((row) => row.farmerId === selected.id)?.outstandingDue, "1.39");
      assert.equal(result.find((row) => row.farmerId === selected.id)?.totalDue, 1);
      assert.equal(await due(txn.id), "1.23");
    });

    await t.test("rejects malformed, negative, zero, and overpayment atomically", async () => {
      const selected = await farmer("Validation", "9000000007", "Central");
      const txn = await seedTxn(selected, selected.name, selected.contact, selected.village, "100.00");
      const baselineCount = (await db.select({ id: cashEntries.id }).from(cashEntries)
        .where(eq(cashEntries.merchantId, merchantId))).length;

      const invalidEntries = [
        { amount: "bad", pettyAdjustment: "0.00" },
        { amount: "-1.00", pettyAdjustment: "0.00" },
        { amount: "0.00", pettyAdjustment: "0.00" },
        { amount: "100.01", pettyAdjustment: "0.00" },
        { amount: "1.00", pettyAdjustment: "-0.01" },
      ];
      for (const invalid of invalidEntries) {
        await assert.rejects(pay(selected, invalid.amount, invalid.pettyAdjustment));
        assert.equal(await due(txn.id), "100.00");
        const count = (await db.select({ id: cashEntries.id }).from(cashEntries)
          .where(eq(cashEntries.merchantId, merchantId))).length;
        assert.equal(count, baselineCount);
      }
    });

    await t.test("reverses legacy payments with null targets", async () => {
      const selected = await farmer("Legacy Reverse", "9000000008", "Legacy");
      const txn = await seedTxn(selected, selected.name, selected.contact, selected.village, "50.00", {
        totalRevenue: "50.00",
      });
      const entry = await pay(selected, "15.00");
      await db.update(cashEntries)
        .set({ seedSettlementTargets: null })
        .where(eq(cashEntries.id, entry.id));
      assert.equal(await due(txn.id), "35.00");

      await storage.reverseCashEntry(entry.id, merchantId);
      assert.equal(await due(txn.id), "50.00");
    });

    await t.test("only one concurrent over-due payment and one concurrent reversal succeeds", async () => {
      const selected = await farmer("Concurrent Pay", "9000000009", "Concurrent");
      const txn = await seedTxn(selected, selected.name, selected.contact, selected.village, "100.00");
      const attempts = await Promise.allSettled([
        pay(selected, "70.00"),
        pay(selected, "70.00", "0.00", "fifo"),
      ]);
      assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
      assert.equal(await due(txn.id), "30.00");

      const successful = attempts.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof pay>>> =>
        result.status === "fulfilled");
      assert.ok(successful);
      const reversals = await Promise.allSettled([
        storage.reverseCashEntry(successful.value.id, merchantId),
        storage.reverseCashEntry(successful.value.id, merchantId),
      ]);
      assert.equal(reversals.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(reversals.filter((result) => result.status === "rejected").length, 1);
      assert.equal(await due(txn.id), "100.00");
    });
  } finally {
    // Every fixture is scoped to the disposable merchant; delete child rows before
    // parents so no existing tenant's records can be touched.
    await db.delete(cashEntries).where(eq(cashEntries.merchantId, merchantId));
    await db.delete(seedTransactions).where(eq(seedTransactions.merchantId, merchantId));
    if (farmerIds.size > 0) {
      await db.delete(farmers).where(and(
        eq(farmers.merchantId, merchantId),
      ));
    }
    await db.delete(merchants).where(eq(merchants.id, merchantId));
  }
});