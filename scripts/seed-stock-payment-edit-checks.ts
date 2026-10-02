import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  cashEntries, coldStores, coldStoreChargeAllocations,
  seedLots, seedStockEntries, seedStockEntryEditHistory,
} from "@shared/schema";
import { db } from "../server/db";
import { storage } from "../server/storage";

// Uses the authenticated, disposable-merchant browser from test-seed-deletion-ui.
// Run: npx tsx scripts/test-seed-deletion-ui.ts
interface BrowserHarness {
  merchantId: number;
  serialBase: number;
  reloadRegister(): Promise<void>;
  click(testId: string): Promise<void>;
  evaluate<T = any>(expression: string): Promise<T>;
  waitFor<T>(description: string, read: () => Promise<T>, ready: (value: T) => boolean): Promise<T>;
  api(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }>;
}

export async function checkSeedStockPaymentEdits(browser: BrowserHarness) {
  const { merchantId, serialBase, api, evaluate, waitFor } = browser;
  for (const [index, paid] of [40, 100].entries()) {
    let entryId: number | undefined;
    let coldStoreId: number | undefined;
    let receiptId: number | undefined;
    try {
      const [coldStore] = await db.insert(coldStores).values({
        merchantId, name: `Payment Edit Store ${index}`, address: "Disposable test",
        dateAdded: "2026-05-01",
      }).returning();
      coldStoreId = coldStore.id;
      const [entry] = await db.insert(seedStockEntries).values({
        merchantId, serialNumber: serialBase + 100 + index,
        purchaseDate: new Date().toISOString().slice(0, 10),
        supplierName: `Payment Edit Supplier ${index}`, district: "Test", state: "Test",
      }).returning();
      entryId = entry.id;
      const lot = await storage.createSeedLot({
        merchantId, seedEntryId: entry.id, coldStoreDbId: coldStore.id,
        coldStoreName: coldStore.name, originalBags: 10, remainingBags: 10,
        potatoType: "Jyoti", bagType: "Ration", size: "Medium",
        pricePerBag: "100.00", coldStoreChargesPerBag: "10.00",
        hammaliCharges: "3.00", gradingCharges: "4.00", transportCharges: "5.00",
        remarks: "Keep lot notes",
      });
      // Create actual payment allocations, not just a synthetic paid counter.
      const receipt = await storage.createCashEntryWithFIFO({
        merchantId, direction: "outflow", receiptType: "cash_paid",
        expenseType: "cold_store_charge", coldStoreDbId: coldStore.id,
        coldStoreName: coldStore.name, amount: String(paid), entryDate: "2026-05-01",
        remarks: "Payment audit must survive stock edits",
      }, true);
      receiptId = receipt.id;
      const allocations = () => db.select().from(coldStoreChargeAllocations)
        .where(eq(coldStoreChargeAllocations.cashEntryId, receipt.id));
      const receiptRow = () => db.select().from(cashEntries).where(eq(cashEntries.id, receipt.id));
      const due = async () => (await storage.getColdStoresWithDue(merchantId))
        .find(row => row.coldStoreDbId === coldStore.id)?.totalDue ?? 0;
      const baselineAllocations = await allocations();
      const baselineReceipt = await receiptRow();
      assert.equal(baselineAllocations.length, 1);
      assert.equal(baselineAllocations[0].seedLotId, lot.id);
      assert.equal(Number(baselineAllocations[0].appliedAmount), paid);
      assert.equal(await due(), 100 - paid);
      const unchangedPayment = async () => {
        const saved = (await storage.getSeedLotById(lot.id, merchantId))!;
        assert.equal(Number(saved.coldStoreChargesPaid), paid);
        assert.equal(Number(saved.coldStoreChargesPerBag), 10);
        assert.equal(await due(), 100 - paid);
        assert.deepEqual(await allocations(), baselineAllocations);
        assert.deepEqual(await receiptRow(), baselineReceipt);
        const history = await storage.getSeedEditHistory(entry.id, merchantId);
        assert.ok(history.every(record => record.changeSet.every(change =>
          change.changes.every(field => field.field !== "Cold Charges Paid"))),
        "Unrelated edits must not claim a payment change");
      };

      // Ordinary browser edit: use the real dialog and its actual save payload.
      await browser.reloadRegister();
      await waitFor("paid stock edit button", () => evaluate<boolean>(
        `!!document.querySelector('[data-testid="button-seed-edit-${entry.id}"]')`), Boolean);
      await browser.click(`button-seed-edit-${entry.id}`);
      await waitFor("stock edit dialog", () => evaluate<boolean>(
        `!!document.querySelector('[data-testid="textarea-seed-remarks"]')`), Boolean);
      await evaluate(`(() => {
        const input = document.querySelector('[data-testid="textarea-seed-remarks"]');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, "Browser edit ${paid}");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })()`);
      await browser.click("button-seed-edit-save");
      await waitFor("stock edit dialog closed", () => evaluate<boolean>(
        `!document.querySelector('[data-testid="button-seed-edit-save"]')`), Boolean);
      assert.equal((await storage.getSeedEntryById(entry.id, merchantId))?.remarks, `Browser edit ${paid}`);
      await unchangedPayment();

      // Entry-only and minimal lot PATCH requests must not erase charge rates,
      // paid balances, destinations, receipts, or incidental lot notes.
      for (const body of [
        { remarks: "Entry-only API edit" },
        { seedLots: [{ id: lot.id, potatoType: "Kufri" }] },
        { seedLots: [{ id: lot.id, pricePerBag: 125 }] },
        { seedLots: [{ id: lot.id }] },
      ]) {
        const response = await api("PATCH", `/api/seed-stock-entries/${entry.id}`, body);
        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert.equal(Number(response.body.seedLots[0].coldStoreChargesPaid), paid);
        await unchangedPayment();
        const saved = (await storage.getSeedLotById(lot.id, merchantId))!;
        assert.equal(Number(saved.hammaliCharges), 3);
        assert.equal(Number(saved.gradingCharges), 4);
        assert.equal(Number(saved.transportCharges), 5);
        assert.equal(saved.remarks, "Keep lot notes");
      }

      // Reversing the original receipt still deliberately restores the dues
      // and keeps the original receipt/allocation as audit evidence.
      const reversed = await api("POST", `/api/cash/entries/${receipt.id}/reverse`, {});
      assert.equal(reversed.status, 200, JSON.stringify(reversed.body));
      assert.equal(Number((await storage.getSeedLotById(lot.id, merchantId))?.coldStoreChargesPaid), 0);
      assert.equal(await due(), 100);
      assert.deepEqual(await allocations(), baselineAllocations);
      const [audit] = await receiptRow();
      assert.equal(audit.isReversed, true);
      assert.ok(audit.reversedAt);
      assert.equal(audit.amount, baselineReceipt[0].amount);
      assert.equal(audit.remarks, baselineReceipt[0].remarks);
      // Subsequent stock edits must not restore the reversed payment.
      assert.equal((await api("PATCH", `/api/seed-stock-entries/${entry.id}`, {
        seedLots: [{ id: lot.id, size: "Small" }],
      })).status, 200);
      assert.equal(Number((await storage.getSeedLotById(lot.id, merchantId))?.coldStoreChargesPaid), 0);
      assert.equal(await due(), 100);
      console.log(`PASS: ${paid === 100 ? "fully" : "partially"} paid seed stock browser/API edits preserve payments and explicit reversal`);
    } finally {
      if (receiptId !== undefined) {
        await db.delete(coldStoreChargeAllocations).where(eq(coldStoreChargeAllocations.cashEntryId, receiptId));
        await db.delete(cashEntries).where(eq(cashEntries.id, receiptId));
      }
      if (entryId !== undefined) {
        await db.delete(seedStockEntryEditHistory).where(eq(seedStockEntryEditHistory.seedEntryId, entryId));
        await db.delete(seedLots).where(eq(seedLots.seedEntryId, entryId));
        await db.delete(seedStockEntries).where(eq(seedStockEntries.id, entryId));
      }
      if (coldStoreId !== undefined) await db.delete(coldStores).where(eq(coldStores.id, coldStoreId));
    }
  }
}