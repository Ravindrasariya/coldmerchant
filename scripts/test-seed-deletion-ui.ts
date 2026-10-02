import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq, sql } from "drizzle-orm";
import WebSocket from "ws";
import {
  cashEntries,
  farmers,
  merchants,
  seedLots,
  seedStockEntries,
  seedStockEntryEditHistory,
  seedTransactions,
  seedTransactionEditHistory,
  seedTransactionItems,
  session as sessions,
  users,
} from "@shared/schema";
import { hashPassword } from "../server/auth";
import { db, pool } from "../server/db";
import { checkSeedStockPaymentEdits } from "./seed-stock-payment-edit-checks";

const appUrl = new URL(
  process.env.APP_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:5000"),
);
const suffix = randomUUID();
const browserProfile = await mkdtemp(join(tmpdir(), "seed-deletion-ui-chrome-"));
const screenshotDir = await mkdtemp(join(tmpdir(), "seed-deletion-ui-shots-"));
const chromiumExecutable = process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium";
const username = `seed_delete_${suffix.replaceAll("-", "")}`;
const readOnlyUsername = `${username}_ro`;
const otherUsername = `${username}_other`;
const password = randomUUID();
const merchantName = `seed-delete-ui-${suffix}`;
const farmerName = `Seed Delete UI Farmer ${suffix}`;
const supplierName = `Seed Delete UI Supplier ${suffix}`;
const serialBase = 700000 + Math.floor(Math.random() * 200000);
const txnBase = 700000 + Math.floor(Math.random() * 200000);

let merchantId: number | undefined;
let otherMerchantId: number | undefined;
let userIds: number[] = [];
let farmerId: number | undefined;
let stockEntryIds: number[] = [];
let lotIds: number[] = [];
let transactionIds: number[] = [];
let browser: ChildProcess | undefined;
let browserPort: number | undefined;
let socket: WebSocket | undefined;

function check(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate Chromium's local debugging port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitFor<T>(description: string, read: () => Promise<T>, ready: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 20_000;
  let value: T;
  while (Date.now() < deadline) {
    value = await read();
    if (ready(value)) return value;
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${description}; last value: ${String(value!)}`);
}

let commandId = 0;
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();

async function connectToPage(): Promise<void> {
  if (!browserPort) throw new Error("Chromium debugging port is unavailable");
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${browserPort}/json/list`)).json()) as any[];
      const page = pages.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) {
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise<void>((resolve, reject) => {
          socket!.once("open", resolve);
          socket!.once("error", reject);
        });
        socket.on("message", (raw) => {
          const message = JSON.parse(raw.toString());
          if (!message.id || !pending.has(message.id)) return;
          const item = pending.get(message.id)!;
          pending.delete(message.id);
          if (message.error) item.reject(new Error(message.error.message || "CDP command failed"));
          else item.resolve(message.result);
        });
        return;
      }
    } catch {
      // Chromium's debugging endpoint is not ready yet.
    }
    await delay(150);
  }
  throw new Error("Chromium DevTools page did not appear");
}

function cdp(method: string, params: Record<string, unknown> = {}): Promise<any> {
  if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("Chromium DevTools connection is closed");
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket!.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      const item = pending.get(id);
      if (item) {
        pending.delete(id);
        reject(new Error(`DevTools command ${method} timed out`));
      }
    }, 25_000).unref();
  });
}

async function evaluate<T = any>(expression: string): Promise<T> {
  const response = await cdp("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result?.value as T;
}

async function clickTestId(testId: string): Promise<void> {
  const found = await evaluate<boolean>(`(() => {
    const element = document.querySelector('[data-testid="${testId}"]');
    if (!element) return false;
    element.click();
    return true;
  })()`);
  check(found, `Expected UI control ${testId}`);
}

async function clickVisibleTestId(testId: string): Promise<void> {
  const rect = await waitFor("unobstructed control " + testId, () => evaluate<{ x: number; y: number } | null>(`(() => {
    const element = document.querySelector('[data-testid="${testId}"]');
    if (!element) return null;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (!element.contains(top)) return null;
    return rect.width && rect.height ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`), Boolean);
  check(rect, `Expected visible UI control ${testId}`);
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
}

async function setViewport(width: number, height: number, mobile: boolean): Promise<void> {
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
}

async function saveScreenshot(fileName: string): Promise<void> {
  const shot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(screenshotDir, fileName), Buffer.from(shot.data, "base64"));
}

async function loginAs(user: string): Promise<void> {
  const response = await evaluate<{ status: number }>(`(async () => {
    const response = await fetch("/api/login", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: ${JSON.stringify(user)}, password: ${JSON.stringify(password)} })
    });
    return { status: response.status };
  })()`);
  assert.equal(response.status, 200, `Real /api/login must authenticate ${user}`);
  await cdp("Page.reload");
  await waitFor("app document after login", () => evaluate<string>("document.readyState"), (state) => state === "complete");
  await waitFor("authenticated app shell", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"tab-seed\\"]")'), Boolean);
  await clickVisibleTestId("tab-seed");
  await waitFor("Seed main navigation selected", () => evaluate<boolean>('document.querySelector("[data-testid=\\"tab-seed\\"]")?.getAttribute("data-state") === "active"'), Boolean);
  await waitFor("Seed section", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"tab-seed-stock-register\\"]")'), Boolean);
}

async function goToRegister(): Promise<void> {
  await clickVisibleTestId("tab-seed-stock-register");
  await waitFor(
    "seed stock register",
    () => evaluate<string>(`(() => {
      const tab = document.querySelector('[data-testid="tab-seed-stock-register"]');
      return tab ? tab.getAttribute("data-state") || "present-no-state" : "missing";
    })()`),
    (state) => state === "active",
  );
}

async function goToTransactions(): Promise<void> {
  await clickVisibleTestId("tab-seed-transactions");
  await waitFor("seed transactions tab", () => evaluate<boolean>('document.querySelector("[data-testid=\\"tab-seed-transactions\\"]")?.getAttribute("data-state") === "active"'), Boolean);
}

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  return evaluate<{ status: number; body: any }>(`(async () => {
    const response = await fetch(${JSON.stringify(path)}, {
      method: ${JSON.stringify(method)},
      credentials: "include",
      ...( ${body === undefined ? "false" : "true"} ? {
        headers: { "Content-Type": "application/json" },
        body: ${JSON.stringify(body === undefined ? null : JSON.stringify(body))}
      } : {})
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  })()`);
}

async function insertStockEntry(serialNumber: number, amountPaid = "0.00"): Promise<{ id: number; lotId: number }> {
  const [entry] = await db.insert(seedStockEntries).values({
    merchantId: merchantId!,
    serialNumber,
    purchaseDate: new Date().toISOString().slice(0, 10),
    supplierName,
    district: "Test District",
    state: "Test State",
    amountPaid,
  }).returning({ id: seedStockEntries.id });
  stockEntryIds.push(entry.id);
  const [lot] = await db.insert(seedLots).values({
    seedEntryId: entry.id,
    merchantId: merchantId!,
    coldStoreName: `Test Cold Store ${suffix.slice(0, 8)}`,
    originalBags: 10,
    potatoType: "Jyoti",
    bagType: "Ration",
    size: "Medium",
    pricePerBag: "100.00",
    avgCostPerBag: "100.00",
    coldStoreChargesPerBag: "0",
    coldStoreChargesPaid: "0",
    remainingBags: 10,
    soldBags: 0,
  }).returning({ id: seedLots.id });
  lotIds.push(lot.id);
  return { id: entry.id, lotId: lot.id };
}

async function insertTransaction(number: number, lotId: number, farmer: string, bagsMoved = 1): Promise<number> {
  const [transaction] = await db.insert(seedTransactions).values({
    merchantId: merchantId!,
    transactionNumber: number,
    farmerId,
    farmerName: farmer,
    farmerContact: "9999999911",
    village: `Seed delete village ${suffix.slice(0, 8)}`,
    district: "Test District",
    state: "Test State",
    totalBags: bagsMoved,
    totalCost: String(100 * bagsMoved),
    totalRevenue: String(150 * bagsMoved),
    totalProfitLoss: String(50 * bagsMoved),
    totalDueToFarmer: String(150 * bagsMoved),
  }).returning({ id: seedTransactions.id });
  transactionIds.push(transaction.id);
  await db.insert(seedTransactionItems).values({
    seedTransactionId: transaction.id,
    merchantId: merchantId!,
    seedLotId: lotId,
    serialNumber: serialBase,
    coldStoreName: `Test Cold Store ${suffix.slice(0, 8)}`,
    potatoType: "Jyoti",
    size: "Medium",
    bagType: "Ration",
    bagsMoved,
    pricePerBag: "150.00",
    costPerBag: "100.00",
    revenue: String(150 * bagsMoved),
    cost: String(100 * bagsMoved),
    profitLoss: String(50 * bagsMoved),
  });
  await db.update(seedLots).set({ remainingBags: 10 - bagsMoved, soldBags: bagsMoved }).where(eq(seedLots.id, lotId));
  return transaction.id;
}

function hasToastText(text: string): Promise<boolean> {
  return waitFor(`toast containing ${text}`, () => evaluate<boolean>(`document.body.innerText.includes(${JSON.stringify(text)})`), Boolean);
}

try {
  const [merchant] = await db.insert(merchants).values({ name: merchantName }).returning({ id: merchants.id });
  merchantId = merchant.id;
  const [otherMerchant] = await db.insert(merchants).values({ name: `${merchantName}-other` }).returning({ id: merchants.id });
  otherMerchantId = otherMerchant.id;
  const hashedPassword = await hashPassword(password);
  for (const account of [
    { username, name: "Seed Delete UI", canEdit: true, assignedMerchant: merchantId },
    { username: readOnlyUsername, name: "Seed Delete UI Read Only", canEdit: false, assignedMerchant: merchantId },
    { username: otherUsername, name: "Seed Delete UI Other Merchant", canEdit: true, assignedMerchant: otherMerchantId },
  ]) {
    const [user] = await db.insert(users).values({
      username: account.username,
      password: hashedPassword,
      name: account.name,
      merchantId: account.assignedMerchant,
      isSystemAdmin: false,
      canEdit: account.canEdit,
      mustChangePassword: false,
    }).returning({ id: users.id });
    userIds.push(user.id);
  }
  const [farmer] = await db.insert(farmers).values({
    merchantId,
    dateAdded: new Date().toISOString().slice(0, 10),
    name: farmerName,
    contact: "9999999911",
    village: `Seed delete village ${suffix.slice(0, 8)}`,
    remainingReceivable: "0.00",
  }).returning({ id: farmers.id });
  farmerId = farmer.id;

  const disposable = await insertStockEntry(serialBase);
  const linked = await insertStockEntry(serialBase + 1);
  const activePaymentStock = await insertStockEntry(serialBase + 2, "0");
  const freeTransactionId = await insertTransaction(txnBase, disposable.lotId, farmerName, 2);
  const paymentTransactionId = await insertTransaction(txnBase + 1, activePaymentStock.lotId, `${farmerName} Payment`);
  await insertTransaction(txnBase + 2, linked.lotId, `${farmerName} Linked`);
  const editTransactionId = await insertTransaction(txnBase + 3, linked.lotId, `${farmerName} Edit`);
  // Keep the edit-only fixture from making the linked stock entry blocker ambiguous;
  // it is an additional linked record and is deleted after the toast assertions.
  await db.insert(cashEntries).values({
    merchantId,
    direction: "inward",
    receiptType: "cash_received",
    revenueType: "seed_sale",
    farmerName: `${farmerName} Payment`,
    farmerVillage: `Seed delete village ${suffix.slice(0, 8)}`,
    farmerContact: "9999999911",
    farmerId,
    amount: "10.00",
    pettyAdjustment: "0",
    seedSettlementTargets: [{ seedTransactionId: paymentTransactionId, amount: "10.00", pettyAdjustment: "0" }],
    entryDate: new Date().toISOString().slice(0, 10),
    isReversed: false,
  });

  browserPort = await findFreePort();
  browser = spawn(chromiumExecutable, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run",
    "--no-default-browser-check", `--remote-debugging-port=${browserPort}`,
    `--user-data-dir=${browserProfile}`, "about:blank",
  ], { stdio: "ignore" });
  await connectToPage();
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await setViewport(1365, 1000, false);
  await cdp("Page.navigate", { url: appUrl.toString() });
  await waitFor("initial app document", () => evaluate<string>("document.readyState"), (state) => state === "complete");

  const unauthenticated = await api("DELETE", `/api/seed-transactions/${freeTransactionId}`);
  assert.equal(unauthenticated.status, 403, "Merchant-only middleware must reject unauthenticated seed deletion");

  await loginAs(username);
  const userCheck = await api("GET", "/api/user");
  assert.equal(userCheck.status, 200);
  assert.equal(userCheck.body.merchantId, merchantId, "Browser session must belong to the isolated disposable merchant");

  await checkSeedStockPaymentEdits({
    merchantId: merchantId!,
    serialBase,
    api,
    evaluate,
    waitFor,
    click: clickVisibleTestId,
    reloadRegister: async () => {
      await loginAs(username);
      await goToRegister();
    },
  });

  const soldLotPath = `/api/seed-stock-entries/${disposable.id}/lots/${disposable.lotId}`;
  const soldDelete = await api("DELETE", soldLotPath);
  assert.equal(soldDelete.status, 409);
  assert.equal(soldDelete.body.code, "SEED_LOT_SOLD");
  assert.equal((await api("DELETE", `/api/seed-stock-entries/${disposable.id}/lots/bad-id`)).status, 400);
  assert.equal((await api("DELETE", `/api/seed-stock-entries/2147483647/lots/${disposable.lotId}`)).status, 404);
  const wrongParentEdit = await api("PATCH", `/api/seed-stock-entries/${disposable.id}`, {
    remarks: "must not change",
    seedLots: [{ id: linked.lotId, originalBags: 9 }],
  });
  assert.equal(wrongParentEdit.status, 404);

  // Test history independently from the denormalized sold counter through the live API.
  await db.update(seedLots).set({ soldBags: 0, remainingBags: 10 }).where(eq(seedLots.id, disposable.lotId));
  assert.equal((await api("DELETE", soldLotPath)).status, 409);
  const staleCounterEdit = await api("PATCH", `/api/seed-stock-entries/${disposable.id}`, {
    seedLots: [{ id: disposable.lotId, originalBags: 1, remainingBags: 100 }],
  });
  assert.equal(staleCounterEdit.status, 409);
  assert.equal(staleCounterEdit.body.minimumBags, 2);
  for (const originalBags of [2, 12, 10]) {
    const edited = await api("PATCH", `/api/seed-stock-entries/${disposable.id}`, {
      seedLots: [{ id: disposable.lotId, originalBags, remainingBags: 100 }],
    });
    assert.equal(edited.status, 200);
    const lot = edited.body.seedLots.find((lot: any) => lot.id === disposable.lotId);
    assert.equal(lot.remainingBags, originalBags - 2);
    assert.equal(lot.soldBags, 2);
  }
  const unsold = await insertStockEntry(serialBase + 40);
  await db.update(seedLots).set({ soldBags: 1 }).where(eq(seedLots.id, unsold.lotId));
  const wholeEntryDelete = await api("DELETE", `/api/seed-stock-entries/${unsold.id}`);
  assert.equal(wholeEntryDelete.status, 409);
  assert.equal(wholeEntryDelete.body.code, "SEED_LOT_SOLD");
  await db.update(seedLots).set({ soldBags: 0 }).where(eq(seedLots.id, unsold.lotId));
  assert.equal((await api("PATCH", `/api/seed-stock-entries/${unsold.id}`, {
    seedLots: [{ id: unsold.lotId, originalBags: 0 }],
  })).status, 200);
  assert.equal((await api("DELETE", `/api/seed-stock-entries/${unsold.id}/lots/${unsold.lotId}`)).status, 200);
  assert.equal((await api("DELETE", `/api/seed-stock-entries/${unsold.id}/lots/${unsold.lotId}`)).status, 404);
  // Keep the existing edit-history expectations relative to their original fixture.
  await db.delete(seedStockEntryEditHistory).where(eq(seedStockEntryEditHistory.seedEntryId, disposable.id));

  if (process.env.SEED_LOT_ONLY === "1") {
    const before = await db.select().from(seedLots).where(eq(seedLots.id, disposable.lotId));
    const sibling = await db.insert(seedLots).values({ ...before[0], id: undefined, soldBags: 0, remainingBags: 10 }).returning();
    const mixed = await api("PATCH", `/api/seed-stock-entries/${disposable.id}`, {
      remarks: "must roll back",
      seedLots: [{ id: sibling[0].id, originalBags: 9 }, { id: disposable.lotId, originalBags: 1 }],
    });
    assert.equal(mixed.status, 400);
    assert.equal((await db.select().from(seedLots).where(eq(seedLots.id, sibling[0].id)))[0].originalBags, 10);
    assert.equal((await db.select().from(seedStockEntries).where(eq(seedStockEntries.id, disposable.id)))[0].remarks, null);
    assert.equal((await db.select().from(seedStockEntryEditHistory).where(eq(seedStockEntryEditHistory.seedEntryId, disposable.id))).length, 0);
    await db.delete(seedLots).where(eq(seedLots.id, sibling[0].id));

    for (const language of ["en", "hi"]) {
      await evaluate(`localStorage.setItem("language", ${JSON.stringify(language)})`);
      await cdp("Page.reload");
      await waitFor("authenticated navigation", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"tab-seed\\"]")?.getClientRects().length'), Boolean);
      await clickVisibleTestId("tab-seed");
      await waitFor("Seed section", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"tab-seed-stock-register\\"]")'), Boolean);
      await goToRegister();
      await waitFor("stock edit", () => evaluate<boolean>(`!!document.querySelector('[data-testid="button-seed-edit-${disposable.id}"]')`), Boolean);
      await clickTestId(`button-seed-edit-${disposable.id}`);
      await waitFor("sold minimum", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"seed-lot-0-sold-minimum\\"]")'), Boolean);
      await evaluate(`(() => {
        const input = document.querySelector('[data-testid="input-seed-lot-0-original-bags"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "1");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })()`);
      await waitFor("localized sold-bag warning", () => evaluate<string>("document.body.innerText"), text =>
        text.includes(language === "en" ? "At least 2 bags" : "कम से कम 2 बोरियां"));
      assert.equal(await evaluate<string>('document.querySelector("[data-testid=\\"input-seed-lot-0-original-bags\\"]").value'), "2");
      await saveScreenshot(`sold-bag-minimum-${language}.png`);
      await clickTestId("button-seed-edit-cancel");
      await waitFor("edit closed", () => evaluate<boolean>('!document.querySelector("[data-testid=\\"input-seed-lot-0-original-bags\\"]")'), Boolean);
    }
    for (const account of [readOnlyUsername, otherUsername]) {
      await evaluate(`fetch("/api/logout", { method: "POST", credentials: "include" })`);
      await loginAs(account);
      const expected = account === readOnlyUsername ? 403 : 404;
      assert.equal((await api("DELETE", soldLotPath)).status, expected);
      assert.equal((await api("PATCH", `/api/seed-stock-entries/${disposable.id}`, {
        seedLots: [{ id: disposable.lotId, originalBags: 1 }],
      })).status, expected);
    }
    console.log("Sold seed lot verification passed: sold/stale-history deletion blockers, equal/higher edits, unsold deletion, mixed-lot rollback, ownership, permissions, English/Hindi minimum hints and warning toasts.");
    console.log(`Screenshots saved under ${screenshotDir}`);
  } else {
  const editedRemarks = `Seed deletion UI remarks ${suffix}`;
  const stockPatch = await api("PATCH", `/api/seed-stock-entries/${disposable.id}`, { remarks: editedRemarks });
  assert.equal(stockPatch.status, 200, "Authenticated seed stock remarks PATCH should succeed");
  assert.equal(stockPatch.body.remarks, editedRemarks);
  const stockHistoryAfterEdit = await db.select().from(seedStockEntryEditHistory).where(and(
    eq(seedStockEntryEditHistory.seedEntryId, disposable.id),
    eq(seedStockEntryEditHistory.merchantId, merchantId!),
  ));
  assert.equal(stockHistoryAfterEdit.length, 1, "Successful stock remarks edit should create merchant-scoped edit history");

  const remarksBeforeRejectedPatch = stockPatch.body.remarks;
  const historyCountBeforeRejectedPatch = stockHistoryAfterEdit.length;
  // This is schema-valid (minimum one bag), but below the lot's two already-sold
  // bags. Entry remarks are intentionally included because the route applies
  // entry-level changes before validating lot capacity; the write transaction
  // must roll those changes and their history back on this late 400 response.
  const rejectedStockPatch = await api("PATCH", `/api/seed-stock-entries/${disposable.id}`, {
    remarks: `Must roll back ${suffix}`,
    seedLots: [{ id: disposable.lotId, originalBags: 1 }],
  });
  assert.equal(rejectedStockPatch.status, 400, "Reducing original bags below persistent sold bags must be rejected");
  const stockAfterRejectedPatch = await db.select().from(seedStockEntries).where(and(
    eq(seedStockEntries.id, disposable.id),
    eq(seedStockEntries.merchantId, merchantId!),
  ));
  assert.equal(stockAfterRejectedPatch[0]?.remarks, remarksBeforeRejectedPatch, "Late validation failure must roll back preceding stock-entry remarks update");
  const stockHistoryAfterRejectedPatch = await db.select().from(seedStockEntryEditHistory).where(and(
    eq(seedStockEntryEditHistory.seedEntryId, disposable.id),
    eq(seedStockEntryEditHistory.merchantId, merchantId!),
  ));
  assert.equal(stockHistoryAfterRejectedPatch.length, historyCountBeforeRejectedPatch, "Late validation failure must not leave edit history");

  const transactionItemsBeforeEdit = await db.select().from(seedTransactionItems).where(and(
    eq(seedTransactionItems.seedTransactionId, freeTransactionId),
    eq(seedTransactionItems.merchantId, merchantId!),
  ));
  const lotBeforeTransactionEdit = await db.select().from(seedLots).where(and(
    eq(seedLots.id, disposable.lotId),
    eq(seedLots.merchantId, merchantId!),
  ));
  const transactionEditHistoryBefore = await db.select().from(seedTransactionEditHistory).where(and(
    eq(seedTransactionEditHistory.seedTransactionId, freeTransactionId),
    eq(seedTransactionEditHistory.merchantId, merchantId!),
  ));
  const vehicleNumber = `SEED-UI-${suffix.slice(0, 12)}`;
  const transactionPatch = await api("PATCH", `/api/seed-transactions/${freeTransactionId}`, {
    vehicleNumber,
    items: transactionItemsBeforeEdit.map((item) => ({
      seedLotId: item.seedLotId,
      bagsMoved: item.bagsMoved,
      pricePerBag: Number(item.pricePerBag),
    })),
  });
  assert.equal(transactionPatch.status, 200, "Authenticated seed transaction edit PATCH should succeed");
  assert.equal(transactionPatch.body.vehicleNumber, vehicleNumber);
  const transactionItemsAfterEdit = await db.select().from(seedTransactionItems).where(and(
    eq(seedTransactionItems.seedTransactionId, freeTransactionId),
    eq(seedTransactionItems.merchantId, merchantId!),
  ));
  assert.deepEqual(
    transactionItemsAfterEdit.map(({ seedLotId, bagsMoved, pricePerBag }) => ({ seedLotId, bagsMoved, pricePerBag })),
    transactionItemsBeforeEdit.map(({ seedLotId, bagsMoved, pricePerBag }) => ({ seedLotId, bagsMoved, pricePerBag })),
    "Transaction edit must preserve its item lots, bag counts, and prices",
  );
  const lotAfterTransactionEdit = await db.select().from(seedLots).where(and(
    eq(seedLots.id, disposable.lotId),
    eq(seedLots.merchantId, merchantId!),
  ));
  assert.equal(lotAfterTransactionEdit[0]?.remainingBags, lotBeforeTransactionEdit[0]?.remainingBags);
  assert.equal(lotAfterTransactionEdit[0]?.soldBags, lotBeforeTransactionEdit[0]?.soldBags);
  const transactionEditHistoryAfter = await db.select().from(seedTransactionEditHistory).where(and(
    eq(seedTransactionEditHistory.seedTransactionId, freeTransactionId),
    eq(seedTransactionEditHistory.merchantId, merchantId!),
  ));
  assert.equal(transactionEditHistoryAfter.length, transactionEditHistoryBefore.length + 1, "Successful transaction edit should create scoped edit history");

  const ownTxnWrongMerchant = await api("DELETE", "/api/seed-transactions/2147483647");
  assert.equal(ownTxnWrongMerchant.status, 404, "Unknown transaction IDs must not be found");
  const ownStockWrongMerchant = await api("DELETE", "/api/seed-stock-entries/2147483647");
  assert.equal(ownStockWrongMerchant.status, 404, "Unknown stock-entry IDs must not be found");
  const invalidTxnId = await api("DELETE", "/api/seed-transactions/not-an-id");
  assert.equal(invalidTxnId.status, 400, "Malformed delete IDs should be rejected");
  assert.equal((await api("DELETE", `/api/seed-transactions/${Number.MAX_SAFE_INTEGER}`)).status, 400,
    "IDs outside the PostgreSQL integer range must be rejected without a database failure");

  await goToRegister();
  await waitFor("disposable stock card", () => evaluate<boolean>(`!!document.querySelector('[data-testid="button-seed-delete-${disposable.id}"]')`), Boolean);
  await saveScreenshot("desktop-stock-register.png");
  await clickTestId(`button-seed-edit-${disposable.id}`);
  await waitFor("sold minimum hint", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"seed-lot-0-sold-minimum\\"]")'), Boolean);
  assert.match(await evaluate<string>('document.querySelector("[data-testid=\\"seed-lot-0-sold-minimum\\"]").textContent'), /Already sold: 2/);
  await evaluate(`(() => {
    const input = document.querySelector('[data-testid="input-seed-lot-0-original-bags"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "1");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await waitFor("below-sold toast", () => evaluate<string>("document.body.innerText"), text => text.includes("At least 2 bags"));
  assert.equal(await evaluate<string>('document.querySelector("[data-testid=\\"input-seed-lot-0-original-bags\\"]").value'), "2");
  await saveScreenshot("sold-bag-minimum-edit.png");
  await clickTestId("button-seed-edit-cancel");
  await waitFor("stock edit cancelled", () => evaluate<boolean>('!document.querySelector("[data-testid=\\"input-seed-lot-0-original-bags\\"]")'), Boolean);
  await clickTestId(`button-seed-delete-${disposable.id}`);
  await waitFor("stock delete confirmation", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"dialog-delete-seed-stock-entry\\"]")'), Boolean);
  const stockDialog = await evaluate<{ text: string; rect: { width: number; height: number }; cancelVisible: boolean; deleteVisible: boolean }>(`(() => {
    const dialog = document.querySelector('[data-testid="dialog-delete-seed-stock-entry"]');
    const rect = dialog.getBoundingClientRect();
    return {
      text: dialog.innerText,
      rect: { width: rect.width, height: rect.height },
      cancelVisible: !!dialog.querySelector('[data-testid="button-cancel-delete-seed-stock-entry"]')?.getClientRects().length,
      deleteVisible: !!dialog.querySelector('[data-testid="button-confirm-delete-seed-stock-entry"]')?.getClientRects().length,
    };
  })()`);
  assert.match(stockDialog.text, /Delete seed stock entry/);
  assert.match(stockDialog.text, /This action cannot be undone/);
  assert.ok(stockDialog.cancelVisible && stockDialog.deleteVisible, "Delete dialog should expose cancel and destructive actions");
  assert.ok(stockDialog.rect.width < 600, "Delete confirmation should remain a compact Harvest-style dialog");
  await saveScreenshot("desktop-stock-delete-dialog.png");
  await clickTestId("button-cancel-delete-seed-stock-entry");
  await waitFor("stock dialog cancelled", () => evaluate<boolean>('!document.querySelector("[data-testid=\\"dialog-delete-seed-stock-entry\\"]")'), Boolean);
  assert.ok(await db.select().from(seedStockEntries).where(eq(seedStockEntries.id, disposable.id)).then((rows) => rows.length), "Cancel must not delete stock");

  await setViewport(402, 874, true);
  await delay(400);
  await clickTestId(`button-seed-delete-${disposable.id}`);
  await waitFor("phone stock delete dialog", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"dialog-delete-seed-stock-entry\\"]")'), Boolean);
  const phoneDialogFits = await evaluate<boolean>(`(() => {
    const dialog = document.querySelector('[data-testid="dialog-delete-seed-stock-entry"]');
    const rect = dialog.getBoundingClientRect();
    return rect.width <= innerWidth && rect.left >= 0 && rect.right <= innerWidth &&
      !!dialog.querySelector('[data-testid="button-cancel-delete-seed-stock-entry"]')?.getClientRects().length &&
      !!dialog.querySelector('[data-testid="button-confirm-delete-seed-stock-entry"]')?.getClientRects().length;
  })()`);
  check(phoneDialogFits, "Phone confirmation dialog and both actions must fit in the viewport");
  await saveScreenshot("phone-stock-delete-dialog.png");
  await clickTestId("button-cancel-delete-seed-stock-entry");
  await waitFor("phone dialog cancelled", () => evaluate<boolean>('!document.querySelector("[data-testid=\\"dialog-delete-seed-stock-entry\\"]")'), Boolean);
  await saveScreenshot("phone-stock-register.png");
  await setViewport(1365, 1000, false);

  // Deleting a transaction is the only action that releases its sold lot back
  // to both transaction pickers and recomputes the inventory counts.
  await goToTransactions();
  await waitFor("disposable transaction card", () => evaluate<boolean>(`!!document.querySelector('[data-testid="button-delete-seed-txn-${freeTransactionId}"]')`), Boolean);
  await saveScreenshot("desktop-seed-transactions.png");
  await clickTestId(`button-delete-seed-txn-${freeTransactionId}`);
  await waitFor("transaction confirmation dialog", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"dialog-confirm-delete-seed-transaction\\"]")'), Boolean);
  const transactionDialog = await evaluate<{ text: string; width: number }>(`(() => {
    const dialog = document.querySelector('[data-testid="dialog-confirm-delete-seed-transaction"]');
    const rect = dialog.getBoundingClientRect();
    return { text: dialog.innerText, width: rect.width };
  })()`);
  assert.match(transactionDialog.text, /Delete seed transaction/);
  assert.match(transactionDialog.text, /This action cannot be undone/);
  assert.ok(transactionDialog.width < 600, "Transaction confirmation should use a compact, consistent dialog style");
  await saveScreenshot("desktop-seed-transaction-delete-dialog.png");
  await clickTestId("button-cancel-delete-seed-transaction");
  await waitFor("transaction dialog cancelled", () => evaluate<boolean>('!document.querySelector("[data-testid=\\"dialog-confirm-delete-seed-transaction\\"]")'), Boolean);
  assert.ok(await db.select().from(seedTransactions).where(eq(seedTransactions.id, freeTransactionId)).then((rows) => rows.length), "Cancel must not delete transaction");

  await setViewport(402, 874, true);
  await delay(350);
  const phoneTransactionDeleteVisible = await evaluate<boolean>(`!!document.querySelector('[data-testid="button-delete-seed-txn-${freeTransactionId}"]')?.getClientRects().length`);
  check(phoneTransactionDeleteVisible, "Seed transaction delete action should be available on a phone viewport");
  await clickTestId(`button-delete-seed-txn-${freeTransactionId}`);
  await waitFor("phone transaction dialog", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"dialog-confirm-delete-seed-transaction\\"]")'), Boolean);
  const phoneTransactionDialogFits = await evaluate<boolean>(`(() => {
    const dialog = document.querySelector('[data-testid="dialog-confirm-delete-seed-transaction"]');
    const rect = dialog.getBoundingClientRect();
    return rect.width <= innerWidth && rect.left >= 0 && rect.right <= innerWidth &&
      !!dialog.querySelector('[data-testid="button-cancel-delete-seed-transaction"]')?.getClientRects().length &&
      !!dialog.querySelector('[data-testid="button-confirm-delete-seed-transaction"]')?.getClientRects().length;
  })()`);
  check(phoneTransactionDialogFits, "Phone transaction confirmation and actions must fit the viewport");
  await saveScreenshot("phone-seed-transaction-delete-dialog.png");
  await clickTestId("button-cancel-delete-seed-transaction");
  await waitFor("phone transaction dialog cancelled", () => evaluate<boolean>('!document.querySelector("[data-testid=\\"dialog-confirm-delete-seed-transaction\\"]")'), Boolean);
  await setViewport(1365, 1000, false);

  await clickTestId(`button-delete-seed-txn-${freeTransactionId}`);
  await waitFor("second transaction dialog", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"dialog-confirm-delete-seed-transaction\\"]")'), Boolean);
  await clickTestId("button-confirm-delete-seed-transaction");
  await waitFor("successful transaction card refetch", () => evaluate<boolean>(`!document.querySelector('[data-testid="seed-txn-card-${freeTransactionId}"]')`), Boolean);
  assert.equal((await db.select().from(seedTransactions).where(eq(seedTransactions.id, freeTransactionId))).length, 0, "Confirmed transaction delete must remove the database row");
  const restoredLot = await db.select().from(seedLots).where(eq(seedLots.id, disposable.lotId));
  assert.equal(restoredLot[0]?.remainingBags, 10, "Transaction deletion must restore the lot bag count");
  assert.equal(restoredLot[0]?.soldBags, 0, "Transaction deletion must rebuild sold bags");

  const createLots = await api("GET", "/api/seed-transactions/unsold-inventory");
  assert.equal(createLots.status, 200);
  check(JSON.stringify(createLots.body).includes(`"id":${disposable.lotId}`), "Returned lot must be available to the create transaction picker");
  await clickTestId("button-load-seed-truck");
  await waitFor("create transaction dialog", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"select-seed-lot-0\\"]")'), Boolean);
  await clickTestId("select-seed-lot-0");
  const pickerShowsRestoredLot = await waitFor("restored lot option in create picker", () => evaluate<boolean>(`[...document.querySelectorAll('[role="option"]')].some(option => option.textContent?.includes("S#${serialBase}") && option.textContent?.includes(${JSON.stringify(supplierName)}))`), Boolean);
  check(pickerShowsRestoredLot, "Previously sold lot should be selectable in create transaction picker");
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await delay(250);
  await clickTestId("button-cancel-seed-truck");
  await delay(250);
  // Existing edit form uses the same inventory query; its lot picker must also
  // present the returned lot when editing an unrelated surviving transaction.
  await clickTestId(`button-edit-seed-txn-${editTransactionId}`);
  await waitFor("edit transaction dialog", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"select-edit-seed-lot-0\\"]")'), Boolean);
  await clickTestId("select-edit-seed-lot-0");
  const editPickerShowsRestoredLot = await waitFor("restored lot option in edit picker", () => evaluate<boolean>(`[...document.querySelectorAll('[role="option"]')].some(option => option.textContent?.includes("S#${serialBase}") && option.textContent?.includes(${JSON.stringify(supplierName)}))`), Boolean);
  check(editPickerShowsRestoredLot, "Previously sold lot should be selectable in edit transaction picker");
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await delay(250);
  await clickTestId("button-edit-seed-cancel");

  // Active payment and linked transaction constraints must be surfaced as
  // localized toasts while leaving the underlying rows intact.
  await clickTestId(`button-delete-seed-txn-${paymentTransactionId}`);
  await clickTestId("button-confirm-delete-seed-transaction");
  await hasToastText("Please reverse the payment before deleting this transaction");
  const blockedPayment = await api("DELETE", `/api/seed-transactions/${paymentTransactionId}`);
  assert.equal(blockedPayment.status, 409);
  assert.equal(blockedPayment.body.code, "SEED_PAYMENT_ACTIVE");
  await clickTestId("button-cancel-delete-seed-transaction");
  await waitFor("payment-blocker dialog closed", () => evaluate<boolean>('!document.querySelector("[data-testid=\\"dialog-confirm-delete-seed-transaction\\"]")'), Boolean);

  await goToRegister();
  await waitFor("linked stock delete button", () => evaluate<boolean>(`!!document.querySelector('[data-testid="button-seed-delete-${linked.id}"]')`), Boolean);
  await clickTestId(`button-seed-delete-${linked.id}`);
  await clickTestId("button-confirm-delete-seed-stock-entry");
  await hasToastText("This entry is linked to seed transactions");
  const blockedLink = await api("DELETE", `/api/seed-stock-entries/${linked.id}`);
  assert.equal(blockedLink.status, 409);
  assert.equal(blockedLink.body.code, "SEED_TRANSACTIONS_LINKED");
  await clickTestId("button-cancel-delete-seed-stock-entry");

  await evaluate(`localStorage.setItem("language", "hi")`);
  await cdp("Page.reload");
  await waitFor("Hindi app reload", () => evaluate<string>("document.readyState"), (state) => state === "complete");
  await waitFor("Hindi authenticated main navigation", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"tab-seed\\"]")?.getClientRects().length'), Boolean);
  await clickVisibleTestId("tab-seed");
  await clickVisibleTestId("tab-seed-transactions");
  await waitFor("Hindi transaction cards", () => evaluate<boolean>(`!!document.querySelector('[data-testid="button-delete-seed-txn-${paymentTransactionId}"]')`), Boolean);
  await clickTestId(`button-delete-seed-txn-${paymentTransactionId}`);
  await clickTestId("button-confirm-delete-seed-transaction");
  await hasToastText("कृपया इस लेनदेन को हटाने से पहले भुगतान वापस लें");
  await clickTestId("button-cancel-delete-seed-transaction");
  await waitFor("Hindi payment-blocker dialog closed", () => evaluate<boolean>('!document.querySelector("[data-testid=\\"dialog-confirm-delete-seed-transaction\\"]")'), Boolean);
  await clickVisibleTestId("tab-seed-stock-register");
  await waitFor("Hindi linked stock card", () => evaluate<boolean>(`!!document.querySelector('[data-testid="button-seed-delete-${linked.id}"]')`), Boolean);
  await clickTestId(`button-seed-delete-${linked.id}`);
  await clickTestId("button-confirm-delete-seed-stock-entry");
  await hasToastText("यह प्रविष्टि बीज लेनदेन से जुड़ी है");
  await clickTestId("button-cancel-delete-seed-stock-entry");
  await waitFor("Hindi stock-blocker dialog closed", () => evaluate<boolean>('!document.querySelector("[data-testid=\\"dialog-delete-seed-stock-entry\\"]")'), Boolean);

  // Read-only account has no delete affordances and the API independently
  // enforces the same permission boundary for both resource kinds.
  await evaluate(`fetch("/api/logout", { method: "POST", credentials: "include" })`);
  await loginAs(readOnlyUsername);
  assert.equal((await api("DELETE", soldLotPath)).status, 403);
  assert.equal((await api("PATCH", `/api/seed-stock-entries/${disposable.id}`, {
    seedLots: [{ id: disposable.lotId, originalBags: 1 }],
  })).status, 403);
  await goToRegister();
  const readOnlyStock = await evaluate<boolean>(`!document.querySelector('[data-testid="button-seed-delete-${linked.id}"]')`);
  check(readOnlyStock, "Read-only user must not see seed stock delete controls");
  await goToTransactions();
  const readOnlyTxn = await evaluate<boolean>(`!document.querySelector('[data-testid="button-delete-seed-txn-${paymentTransactionId}"]')`);
  check(readOnlyTxn, "Read-only user must not see seed transaction delete controls");
  const readOnlyStockResponse = await api("DELETE", `/api/seed-stock-entries/${linked.id}`);
  const readOnlyTxnResponse = await api("DELETE", `/api/seed-transactions/${paymentTransactionId}`);
  assert.equal(readOnlyStockResponse.status, 403);
  assert.equal(readOnlyTxnResponse.status, 403);

  await evaluate(`fetch("/api/logout", { method: "POST", credentials: "include" })`);
  await loginAs(otherUsername);
  assert.equal((await api("DELETE", soldLotPath)).status, 404);
  assert.equal((await api("PATCH", `/api/seed-stock-entries/${disposable.id}`, {
    seedLots: [{ id: disposable.lotId, originalBags: 1 }],
  })).status, 404);
  const crossMerchantTxn = await api("DELETE", `/api/seed-transactions/${paymentTransactionId}`);
  const crossMerchantStock = await api("DELETE", `/api/seed-stock-entries/${linked.id}`);
  assert.equal(crossMerchantTxn.status, 404, "Another merchant cannot delete this transaction");
  assert.equal(crossMerchantStock.status, 404, "Another merchant cannot delete this stock entry");

  // Return to the owner and successfully delete the isolated free stock entry.
  await evaluate(`fetch("/api/logout", { method: "POST", credentials: "include" })`);
  await loginAs(username);
  await goToRegister();
  await waitFor("free stock delete button", () => evaluate<boolean>(`!!document.querySelector('[data-testid="button-seed-delete-${disposable.id}"]')`), Boolean);
  await clickTestId(`button-seed-delete-${disposable.id}`);
  await clickTestId("button-confirm-delete-seed-stock-entry");
  await waitFor("stock card refetch after delete", () => evaluate<boolean>(`!document.querySelector('[data-testid="seed-stock-entry-card-${disposable.id}"]') || !document.querySelector('[data-testid="button-seed-delete-${disposable.id}"]')`), Boolean);
  await waitFor("stock entry removal in DB", async () => db.select().from(seedStockEntries).where(eq(seedStockEntries.id, disposable.id)), (rows) => rows.length === 0);
  assert.equal((await db.select().from(seedLots).where(eq(seedLots.id, disposable.lotId))).length, 0, "Deleting a stock entry must remove its lots");

  await evaluate(`fetch("/api/logout", { method: "POST", credentials: "include" })`);
  console.log("Seed deletion authenticated UI verification passed: stock/transaction PATCHes, preserved transaction lots/bags/prices, rejected sold-bag reduction with remarks/history rollback, dialogs/cancel/refetch, English/Hindi blockers, create/edit lot restoration, read-only and merchant isolation, malformed/unauthenticated requests.");
  console.log(`Desktop, phone, and dialog screenshots saved under ${screenshotDir}`);
  }
} finally {
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      await evaluate(`fetch("/api/logout", { method: "POST", credentials: "include" })`);
    } catch {
      // Browser/session cleanup below still removes any test session.
    }
    socket.close();
  }
  if (browser && browser.exitCode === null) {
    browser.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => browser!.once("exit", () => resolve())),
      delay(3000),
    ]);
    if (browser.exitCode === null) browser.kill("SIGKILL");
  }
  if (userIds.length) {
    await db.delete(sessions).where(sql`${sessions.sess}->'passport'->>'user' IN (${sql.join(userIds.map((id) => sql`${String(id)}`), sql`, `)})`);
  }
  if (merchantId !== undefined) {
    await db.delete(cashEntries).where(eq(cashEntries.merchantId, merchantId));
    await db.delete(seedTransactionEditHistory).where(eq(seedTransactionEditHistory.merchantId, merchantId));
    await db.delete(seedStockEntryEditHistory).where(eq(seedStockEntryEditHistory.merchantId, merchantId));
    await db.delete(seedTransactionItems).where(eq(seedTransactionItems.merchantId, merchantId));
    await db.delete(seedTransactions).where(eq(seedTransactions.merchantId, merchantId));
    await db.delete(seedLots).where(eq(seedLots.merchantId, merchantId));
    await db.delete(seedStockEntries).where(eq(seedStockEntries.merchantId, merchantId));
    if (farmerId !== undefined) await db.delete(farmers).where(and(eq(farmers.id, farmerId), eq(farmers.merchantId, merchantId)));
    if (userIds.length) await db.delete(users).where(sql`${users.id} IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`);
    await db.delete(merchants).where(eq(merchants.id, merchantId));
  }
  if (otherMerchantId !== undefined) await db.delete(merchants).where(eq(merchants.id, otherMerchantId));
  await rm(browserProfile, { recursive: true, force: true });
  await pool.end();
}