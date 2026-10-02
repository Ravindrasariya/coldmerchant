import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { merchants, seedStockEntries, seedLots, seedTransactions, seedTransactionItems, seedStockEntryEditHistory } from "@shared/schema";
import { db, pool } from "./db";
import { storage } from "./storage";

after(() => pool.end());

test("seed lot sold-history protection", async t => {
  const [merchant] = await db.insert(merchants).values({ name: `seed-lot-test-${randomUUID()}` }).returning();
  const merchantId = merchant.id;
  let serial = 1;
  let transactionNumber = 1;
  const fixture = async (soldBags = 0) => {
    const [entry] = await db.insert(seedStockEntries).values({
      merchantId, serialNumber: serial++, purchaseDate: "2026-05-01",
      supplierName: "Disposable supplier", district: "Test", state: "Test",
    }).returning();
    const lot = await storage.createSeedLot({
      merchantId, seedEntryId: entry.id, coldStoreName: "Test",
      originalBags: 20, soldBags, remainingBags: 20 - soldBags,
      potatoType: "Jyoti", bagType: "Test", size: "Medium", pricePerBag: "10",
    });
    return { entry, lot };
  };
  const read = async (id: number) => storage.getSeedLotById(id, merchantId);
  const code = async (operation: Promise<unknown>, expected: string) =>
    assert.rejects(operation, (e: any) => e.code === expected);
  const sale = async (lotId: number, bagsMoved: number) => {
    return storage.createSeedTransaction({
      merchantId, transactionNumber: transactionNumber++, farmerName: "Disposable farmer", totalBags: bagsMoved,
      totalRevenue: String(bagsMoved * 20), totalDueToFarmer: String(bagsMoved * 20),
    }, [{
      merchantId, seedLotId: lotId, serialNumber: 1, coldStoreName: "Test",
      potatoType: "Jyoti", size: "Medium", bagType: "Test", bagsMoved,
      pricePerBag: "20", costPerBag: "10", revenue: String(bagsMoved * 20),
      cost: String(bagsMoved * 10), profitLoss: String(bagsMoved * 10),
    }]);
  };
  try {
    await t.test("sold lots cannot be deleted or reduced; equal and above preserve counts", async () => {
      const { entry, lot } = await fixture(7);
      const original = await read(lot.id);
      await code(storage.deleteSeedLot(lot.id, merchantId, entry.id), "SEED_LOT_SOLD");
      await code(storage.deleteSeedEntry(entry.id, merchantId), "SEED_LOT_SOLD");
      await code(storage.updateSeedLot(lot.id, merchantId, { originalBags: 6, remainingBags: 99, soldBags: 0 }), "SEED_BAGS_BELOW_SOLD");
      assert.deepEqual(await read(lot.id), original);
      await storage.updateSeedLot(lot.id, merchantId, { originalBags: 7, remainingBags: 99, soldBags: 0 });
      assert.equal((await read(lot.id))?.remainingBags, 0);
      assert.equal((await read(lot.id))?.soldBags, 7);
      await storage.updateSeedLot(lot.id, merchantId, { originalBags: 12 });
      assert.equal((await read(lot.id))?.remainingBags, 5);
      assert.equal((await read(lot.id))?.soldBags, 7);
      for (const value of [-1, 1.5, NaN, Infinity]) {
        await code(storage.updateSeedLot(lot.id, merchantId, { originalBags: value }), "INVALID_BAG_COUNT");
      }
    });
    await t.test("actual linked items protect a lot despite a stale zero sold counter", async () => {
      const { lot } = await fixture();
      const txn = await sale(lot.id, 8);
      await db.update(seedLots).set({ soldBags: 0, remainingBags: 20 }).where(eq(seedLots.id, lot.id));
      await code(storage.deleteSeedLot(lot.id, merchantId), "SEED_LOT_SOLD");
      await code(storage.updateSeedLot(lot.id, merchantId, { originalBags: 7 }), "SEED_BAGS_BELOW_SOLD");
      await storage.updateSeedLot(lot.id, merchantId, { originalBags: 8 });
      assert.equal((await read(lot.id))?.remainingBags, 0);
      assert.equal((await read(lot.id))?.soldBags, 8);
      assert.equal((await db.select().from(seedTransactionItems).where(eq(seedTransactionItems.seedTransactionId, txn.id))).length, 1);
      // Even a zero-bag historical link must never be orphaned.
      await db.update(seedTransactionItems).set({ bagsMoved: 0 }).where(eq(seedTransactionItems.seedTransactionId, txn.id));
      await db.update(seedLots).set({ soldBags: 0 }).where(eq(seedLots.id, lot.id));
      await code(storage.deleteSeedLot(lot.id, merchantId), "SEED_LOT_SOLD");
    });
    await t.test("unsold deletion checks parent and merchant, without changing sibling lots", async () => {
      const { entry, lot } = await fixture();
      const sibling = await storage.createSeedLot({ ...lot, id: undefined } as any);
      const wrong = await fixture();
      await storage.updateSeedLot(wrong.lot.id, merchantId, { originalBags: 0 });
      assert.equal((await read(wrong.lot.id))?.remainingBags, 0);
      await code(storage.deleteSeedLot(lot.id, merchantId + 100000, entry.id), "SEED_LOT_NOT_FOUND");
      await code(storage.deleteSeedLot(lot.id, merchantId, wrong.entry.id), "SEED_LOT_NOT_FOUND");
      await storage.deleteSeedLot(lot.id, merchantId, entry.id);
      assert.equal(await read(lot.id), undefined);
      assert.equal((await read(sibling.id))?.originalBags, 20);
    });
    await t.test("late validation failure rolls back earlier lots, entry remarks, and history", async () => {
      const first = await fixture();
      const second = await fixture(7);
      const baseline = await read(first.lot.id);
      await code(storage.withSeedWriteTransaction(merchantId, async scoped => {
        await scoped.updateSeedEntry(first.entry.id, merchantId, { remarks: "must roll back" });
        await scoped.updateSeedLot(first.lot.id, merchantId, { originalBags: 15, pricePerBag: "99" });
        await scoped.createSeedEditHistory(first.entry.id, merchantId, null, [{
          scope: "entry", entityId: first.entry.id, label: "Entry",
          changes: [{ field: "Remarks", oldValue: "", newValue: "must roll back" }],
        }]);
        await scoped.updateSeedLot(second.lot.id, merchantId, { originalBags: 6 });
      }), "SEED_BAGS_BELOW_SOLD");
      assert.deepEqual(await read(first.lot.id), baseline);
      assert.equal((await storage.getSeedEntryById(first.entry.id, merchantId))?.remarks, null);
      assert.equal((await storage.getSeedEditHistory(first.entry.id, merchantId)).length, 0);
    });
    await t.test("deletion and bag edits wait for sale writes and then check the committed sold count", async () => {
      const deleted = await fixture();
      const edited = await fixture();
      let entered!: () => void;
      let release!: () => void;
      const ready = new Promise<void>(resolve => { entered = resolve; });
      const gate = new Promise<void>(resolve => { release = resolve; });
      const first = storage.withSeedWriteTransaction(merchantId, async scoped => {
        await scoped.updateSeedLot(deleted.lot.id, merchantId, { originalBags: 20 });
        await scoped.updateSeedLot(edited.lot.id, merchantId, { originalBags: 20 });
        // Simulate the committed inventory state from a sale while the common lock is held.
        const client = (scoped as any).seedWriteDb;
        await client.update(seedLots).set({ soldBags: 8, remainingBags: 12 })
          .where(and(eq(seedLots.merchantId, merchantId), sql`${seedLots.id} IN (${deleted.lot.id}, ${edited.lot.id})`));
        entered();
        await gate;
      });
      await ready;
      let complete = 0;
      const remove = storage.deleteSeedLot(deleted.lot.id, merchantId).finally(() => { complete++; });
      const reduce = storage.updateSeedLot(edited.lot.id, merchantId, { originalBags: 7 }).finally(() => { complete++; });
      // Attach rejection handlers before releasing the lock.
      const assertions = Promise.all([code(remove, "SEED_LOT_SOLD"), code(reduce, "SEED_BAGS_BELOW_SOLD")]);
      await new Promise(resolve => setTimeout(resolve, 75));
      try { assert.equal(complete, 0); } finally { release(); }
      await first;
      await assertions;
      assert.equal((await read(deleted.lot.id))?.soldBags, 8);
      assert.equal((await read(edited.lot.id))?.originalBags, 20);
    });
    await t.test("deletion first prevents a later sale, and shrinking first prevents over-selling", async () => {
      const removed = await fixture();
      await storage.deleteSeedLot(removed.lot.id, merchantId);
      await assert.rejects(sale(removed.lot.id, 1), /removed/);
      const smaller = await fixture();
      await storage.updateSeedLot(smaller.lot.id, merchantId, { originalBags: 3 });
      await assert.rejects(sale(smaller.lot.id, 4), /Not enough/);
      const txn = await sale(smaller.lot.id, 3);
      await code(storage.deleteSeedLot(smaller.lot.id, merchantId), "SEED_LOT_SOLD");
      await storage.deleteSeedTransaction(txn.id, merchantId);
      assert.equal((await read(smaller.lot.id))?.remainingBags, 3);
      await storage.deleteSeedLot(smaller.lot.id, merchantId);
    });
  } finally {
    for (const table of [seedTransactionItems, seedTransactions, seedStockEntryEditHistory, seedLots, seedStockEntries, merchants]) {
      await db.delete(table).where(eq(table === merchants ? merchants.id : (table as any).merchantId, merchantId));
    }
  }
});