import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq, sql } from "drizzle-orm";
import WebSocket from "ws";
import { cashEntries, farmers, merchants, seedTransactions, session as sessions, users } from "@shared/schema";
import { hashPassword } from "../server/auth";
import { db, pool } from "../server/db";

const appUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5000");
const suffix = randomUUID();
const testMerchantName = `seed-ui-test-${suffix}`;
const username = `seed_ui_${suffix.replaceAll("-", "")}`;
const password = randomUUID();
const farmerNames = [`Seed UI Farmer ${suffix}`, `Seed UI Petty ${suffix}`];
const browserProfile = await mkdtemp(join(tmpdir(), "seed-payment-ui-chrome-"));
const phoneScreenshot = join(tmpdir(), "seed-payment-ui-phone.png");
const chromiumExecutable = process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium";

let merchantId: number | undefined;
let userId: number | undefined;
let farmerIds: number[] = [];
let seedTransactionIds: number[] = [];
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;
let browserPort: number | undefined;

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
        reject(new Error("Could not allocate a local Chromium debugging port"));
        return;
      }
      const { port } = address;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitFor<T>(description: string, read: () => Promise<T>, isReady: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 20_000;
  let lastValue: T;
  while (Date.now() < deadline) {
    lastValue = await read();
    if (isReady(lastValue)) return lastValue;
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${description}; last observed value: ${String(lastValue!)}`);
}

let nextCommandId = 0;
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();

async function connectToPage(): Promise<void> {
  if (!browserPort) throw new Error("Chromium debugging port is unavailable");
  const deadline = Date.now() + 20_000;
  let pages: any[] = [];
  while (Date.now() < deadline) {
    try {
      pages = await (await fetch(`http://127.0.0.1:${browserPort}/json/list`)).json() as any[];
      const page = pages.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) {
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise<void>((resolve, reject) => {
          socket!.once("open", resolve);
          socket!.once("error", reject);
        });
        socket.on("message", (raw) => {
          const message = JSON.parse(raw.toString());
          if (message.id && pending.has(message.id)) {
            const item = pending.get(message.id)!;
            pending.delete(message.id);
            if (message.error) item.reject(new Error(message.error.message || "CDP command failed"));
            else item.resolve(message.result);
          }
        });
        return;
      }
    } catch {
      // Chromium's debug server is not ready yet.
    }
    await delay(150);
  }
  throw new Error(`Chromium DevTools page did not appear (${pages.length} targets found)`);
}

function cdp(method: string, params: Record<string, unknown> = {}): Promise<any> {
  if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("Chromium DevTools connection is closed");
  const id = ++nextCommandId;
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
  check(found, `Expected to find UI control ${testId}`);
}

async function clickVisibleTestId(testId: string): Promise<void> {
  const rect = await evaluate<{ x: number; y: number } | null>(`(() => {
    const element = document.querySelector('[data-testid="${testId}"]');
    if (!element) return null;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  check(rect, `Expected visible UI control ${testId}`);
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
}

async function fillTestId(testId: string, value: string): Promise<void> {
  const result = await evaluate<{ found: boolean; tag?: string }>(`(() => {
    const element = document.querySelector('[data-testid="${testId}"]');
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      return { found: false };
    }
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { found: true, tag: element.tagName };
  })()`);
  check(result.found, `Expected ${testId} input to be rendered`);
}

async function readInput(testId: string): Promise<string> {
  return evaluate<string>(`document.querySelector('[data-testid="${testId}"]')?.value ?? ""`);
}

async function selectOption(triggerTestId: string, label: string): Promise<void> {
  await clickTestId(triggerTestId);
  const found = await waitFor(`option ${label}`, () => evaluate<boolean>(`(() => {
    const options = [...document.querySelectorAll('[role="option"]')];
    const option = options.find((item) => item.textContent?.trim() === ${JSON.stringify(label)});
    if (!option) return false;
    option.click();
    return true;
  })()`), Boolean);
  check(found, `Could not select ${label} in ${triggerTestId}`);
  await delay(250);
}

async function chooseFarmer(name: string): Promise<void> {
  await clickTestId("select-seed-farmer");
  await waitFor("farmer search box", () => evaluate<boolean>(`!!document.querySelector('input[placeholder="Search farmer..."]')`), Boolean);
  await evaluate(`(() => {
    const input = document.querySelector('input[placeholder="Search farmer..."]');
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, ${JSON.stringify(name)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await delay(350);
  const selected = await waitFor(`farmer ${name}`, () => evaluate<boolean>(`(() => {
    const items = [...document.querySelectorAll('[role="option"]')];
    const item = items.find((candidate) => candidate.textContent?.includes(${JSON.stringify(name)}));
    if (!item) return false;
    item.click();
    return true;
  })()`), Boolean);
  check(selected, `Could not choose fixture farmer ${name}`);
  await delay(250);
}

async function currentDue(transactionId: number): Promise<string | undefined> {
  const [row] = await db.select({ amount: seedTransactions.totalDueToFarmer })
    .from(seedTransactions).where(and(
      eq(seedTransactions.id, transactionId),
      eq(seedTransactions.merchantId, merchantId!),
    ));
  return row?.amount ?? undefined;
}

try {
  const [merchant] = await db.insert(merchants).values({ name: testMerchantName }).returning({ id: merchants.id });
  merchantId = merchant.id;
  const [createdUser] = await db.insert(users).values({
    username,
    password: await hashPassword(password),
    name: "Seed Payment UI Test",
    merchantId,
    isSystemAdmin: false,
    canEdit: true,
    mustChangePassword: false,
  }).returning({ id: users.id });
  userId = createdUser.id;

  for (let index = 0; index < farmerNames.length; index += 1) {
    const [farmer] = await db.insert(farmers).values({
      merchantId,
      dateAdded: "2026-05-01",
      name: farmerNames[index],
      contact: `9${String(Date.now()).slice(-9)}`,
      village: `UI test village ${index + 1}`,
      remainingReceivable: "0.00",
    }).returning({ id: farmers.id, name: farmers.name, contact: farmers.contact, village: farmers.village });
    farmerIds.push(farmer.id);
    const due = index === 0 ? "63078.00" : "78.00";
    const [transaction] = await db.insert(seedTransactions).values({
      merchantId,
      transactionNumber: index + 1,
      farmerId: farmer.id,
      farmerName: farmer.name,
      farmerContact: farmer.contact,
      village: farmer.village,
      totalBags: 1,
      totalRevenue: due,
      totalDueToFarmer: due,
    }).returning({ id: seedTransactions.id });
    seedTransactionIds.push(transaction.id);
  }

  browserPort = await findFreePort();
  browser = spawn(chromiumExecutable, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${browserPort}`,
    `--user-data-dir=${browserProfile}`,
    "about:blank",
  ], { stdio: "ignore" });
  await connectToPage();
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: appUrl.toString() });
  await waitFor("app page load", () => evaluate<string>("document.readyState"), (state) => state === "complete");
  await waitFor("login form or app shell", () => evaluate<boolean>("!!document.body"), Boolean);

  const login = await evaluate<{ status: number; ok: boolean }>(`(async () => {
    const response = await fetch("/api/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: ${JSON.stringify(username)}, password: ${JSON.stringify(password)} })
    });
    return { status: response.status, ok: response.ok };
  })()`);
  assert.equal(login.status, 200, "Real /api/login must authenticate the disposable test user");
  const authCheck = await evaluate<{ status: number; merchantId?: number }>(`(async () => {
    const response = await fetch("/api/user", { credentials: "include" });
    const user = response.ok ? await response.json() : {};
    return { status: response.status, merchantId: user.merchantId };
  })()`);
  assert.equal(authCheck.status, 200, "Browser must hold the real authenticated app session");
  assert.equal(authCheck.merchantId, merchantId, "Authenticated session must belong to the disposable merchant");

  await cdp("Page.navigate", { url: appUrl.toString() });
  await waitFor("authenticated application shell", () => evaluate<boolean>(`!!document.querySelector('[data-testid="tab-cash-management"]')`), Boolean);
  await clickVisibleTestId("tab-cash-management");
  await waitFor("Cash navigation selection", () => evaluate<boolean>(
    `document.querySelector('[data-testid="tab-cash-management"]')?.getAttribute("data-state") === "active"`,
  ), Boolean);
  await waitFor("Cash Management tab visible", () => evaluate<boolean>(
    `!!document.querySelector('[data-testid="cash-management-tab"]')?.getClientRects().length`,
  ), Boolean);
  await clickVisibleTestId("tab-inward");
  await waitFor("inward form selection", () => evaluate<boolean>(
    `document.querySelector('[data-testid="tab-inward"]')?.getAttribute("data-state") === "active"`,
  ), Boolean);
  await selectOption("select-revenue-type", "Seed Sale");
  await chooseFarmer(farmerNames[0]);

  await fillTestId("input-seed-petty-adjustment", "50");
  await chooseFarmer(farmerNames[1]);
  assert.equal(Number(await readInput("input-seed-petty-adjustment")), 0, "Changing farmer must reset Petty Adj");
  await chooseFarmer(farmerNames[0]);

  await fillTestId("input-seed-petty-adjustment", "78");
  await selectOption("select-revenue-type", "Sundry Pay Recovery");
  await selectOption("select-revenue-type", "Seed Sale");
  assert.equal(Number(await readInput("input-seed-petty-adjustment")), 0, "Changing revenue type must reset Petty Adj");
  await chooseFarmer(farmerNames[0]);

  await fillTestId("input-seed-petty-adjustment", "78");
  await selectOption("select-receipt-type", "Account Received");
  await selectOption("select-receipt-type", "Cash Received");
  assert.equal(Number(await readInput("input-seed-petty-adjustment")), 0, "Changing receipt type must reset Petty Adj");

  await chooseFarmer(farmerNames[0]);
  await fillTestId("input-amount", "63000");
  await fillTestId("input-seed-petty-adjustment", "78");
  const totalSettledText = await evaluate<string>(`document.querySelector('[data-testid="seed-total-settled"]')?.innerText ?? ""`);
  assert.match(totalSettledText, /63,078/, "Seed Sale total settled must include cash plus petty adjustment");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 1, mobile: true });
  await delay(350);
  await waitFor("Cash Management at phone width", () => evaluate<boolean>(
    `!!document.querySelector('[data-testid="cash-management-tab"]')?.getClientRects().length && !!document.querySelector('[data-testid="input-seed-petty-adjustment"]')?.getClientRects().length`,
  ), Boolean).catch(async () => {
    await clickVisibleTestId("button-mobile-menu");
    await waitFor("mobile tab menu open", () => evaluate<boolean>(
      `!!document.querySelector('[data-testid="tab-cash-management-mobile"]')?.closest('[data-state="open"]')`,
    ), Boolean);
    await clickVisibleTestId("tab-cash-management-mobile");
    await waitFor("phone Cash tab selection", () => evaluate<boolean>(
      `document.querySelector('[data-testid="tab-cash-management-mobile"]')?.getAttribute("data-state") === "active"`,
    ), Boolean);
    await waitFor("mobile menu to close", () => evaluate<boolean>(
      `!document.querySelector('[data-testid="tab-cash-management-mobile"]')?.closest('[data-state="open"]')`,
    ), Boolean);
  });
  const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(phoneScreenshot, Buffer.from(screenshot.data, "base64"));

  await clickTestId("button-submit-inward");
  await waitFor("first seed payment to appear in history", () => evaluate<boolean>(
    `document.querySelector('[data-testid="cash-management-tab"]')?.innerText.includes(${JSON.stringify(farmerNames[0])}) ?? false`,
  ), Boolean);
  await waitFor("cash received summary of 63,000", () => evaluate<string>(
    `document.querySelector('[data-testid="card-cash-received"]')?.innerText ?? ""`,
  ), (text) => /₹\s*63,000/.test(text));
  assert.equal(await currentDue(seedTransactionIds[0]), "0.00", "Full due should settle to zero after UI save");
  const [firstEntry] = await db.select().from(cashEntries).where(and(
    eq(cashEntries.merchantId, merchantId),
    eq(cashEntries.farmerId, farmerIds[0]),
    eq(cashEntries.revenueType, "seed_sale"),
    eq(cashEntries.isReversed, false),
  ));
  check(firstEntry, "Expected UI-created Seed Sale cash entry in DB");
  assert.equal(firstEntry.amount, "63000.00", "Only cash amount must enter cash book");
  assert.equal(firstEntry.pettyAdjustment, "78.00", "Petty adjustment must be persisted separately");
  assert.deepEqual(firstEntry.seedSettlementTargets, [{
    seedTransactionId: seedTransactionIds[0],
    amount: "63000.00",
    pettyAdjustment: "78.00",
  }], "Payment should settle the cash and petty amounts against the seed transaction");

  // Check that a fresh seed-sale form starts with zero adjustment after the
  // successful save reset, before recording the separate petty-only payment.
  await selectOption("select-revenue-type", "Seed Sale");
  assert.equal(Number(await readInput("input-seed-petty-adjustment")), 0, "Successful save must reset Petty Adj");

  let printedHtml = "";
  await evaluate(`(() => {
    window.__seedPaymentPrintHtml = "";
    const capturePrintFrames = () => {
      for (const frame of document.querySelectorAll('iframe[aria-hidden="true"]')) {
        const html = frame.contentDocument?.documentElement?.outerHTML || "";
        if (html.includes("Cash Flow History")) window.__seedPaymentPrintHtml = html;
      }
    };
    new MutationObserver(capturePrintFrames).observe(document.body, { childList: true, subtree: true });
    window.__seedPaymentPrintCaptureTimer = setInterval(capturePrintFrames, 50);
  })()`);
  await clickTestId("button-cash-print-pdf");
  printedHtml = await waitFor("cash flow print iframe document", () => evaluate<string>("window.__seedPaymentPrintHtml || ''"), Boolean);
  const printRows = await evaluate<{ farmerCells?: string[]; totals?: string[] }>(`(() => {
    const doc = new DOMParser().parseFromString(window.__seedPaymentPrintHtml, "text/html");
    const rows = [...doc.querySelectorAll("tbody tr")];
    const farmerRow = rows.find((row) => row.textContent?.includes("Seed UI Farmer"));
    const totalRow = doc.querySelector("tr.total-row");
    return {
      farmerCells: farmerRow ? [...farmerRow.querySelectorAll("td")].map((cell) => cell.textContent?.trim() || "") : undefined,
      totals: totalRow ? [...totalRow.querySelectorAll("td")].map((cell) => cell.textContent?.trim() || "") : undefined,
    };
  })()`);
  assert.ok(printRows.farmerCells, "Cash Flow print should include the test farmer row");
  assert.equal(printRows.farmerCells[4], "63,000", "Cash Flow printed credit must use the cash amount");
  assert.doesNotMatch(printRows.farmerCells.join(" "), /63,078/, "Petty adjustment must not inflate the printed credit");
  assert.match(printRows.farmerCells[5], /Petty Adj/, "Cash Flow print should disclose the non-cash petty adjustment");
  assert.equal(printRows.totals?.[4], "63,000", "Cash Flow print credit total must remain 63,000");
  check(printedHtml.includes("Cash Flow History"), "Cash Flow print document should be captured from the hidden iframe");
  await evaluate("clearInterval(window.__seedPaymentPrintCaptureTimer)");

  await chooseFarmer(farmerNames[1]);
  await fillTestId("input-amount", "0");
  await fillTestId("input-seed-petty-adjustment", "78");
  const pettyOnlyTotal = await evaluate<string>(`document.querySelector('[data-testid="seed-total-settled"]')?.innerText ?? ""`);
  assert.match(pettyOnlyTotal, /78/, "Petty-only payment should settle 78");
  await clickTestId("button-submit-inward");
  const pettyEntries = await waitFor("petty-only payment to be saved", async () => db.select().from(cashEntries).where(and(
    eq(cashEntries.merchantId, merchantId!),
    eq(cashEntries.farmerId, farmerIds[1]),
    eq(cashEntries.revenueType, "seed_sale"),
    eq(cashEntries.isReversed, false),
  )), (rows) => rows.length === 1);
  assert.equal(await currentDue(seedTransactionIds[1]), "0.00", "Petty-only payment should settle the 78 due");
  const [pettyEntry] = pettyEntries;
  check(pettyEntry, "Expected UI-created petty-only seed payment in DB");
  assert.equal(pettyEntry.amount, "0.00", "Petty-only payment must add zero cash");
  assert.equal(pettyEntry.pettyAdjustment, "78.00", "Petty-only adjustment must remain visible separately");
  await waitFor("cash summary remains 63,000 after petty-only save", () => evaluate<string>(
    `document.querySelector('[data-testid="card-cash-received"]')?.innerText ?? ""`,
  ), (text) => /₹\s*63,000/.test(text));

  // Reverse both disposable payments using the real authenticated app endpoint.
  const reversals = await evaluate<Array<{ status: number; ok: boolean }>>(`(async () => {
    const ids = ${JSON.stringify([firstEntry.id, pettyEntry.id])};
    const results = [];
    for (const id of ids) {
      const response = await fetch("/api/cash/entries/" + id + "/reverse", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      results.push({ status: response.status, ok: response.ok });
    }
    return results;
  })()`);
  assert.deepEqual(reversals.map((result) => result.status), [200, 200], "Both real authenticated reversals must succeed");
  await waitFor("original farmer due to be restored", async () => currentDue(seedTransactionIds[0]), (due) => due === "63078.00");
  assert.equal(await currentDue(seedTransactionIds[1]), "78.00", "Reversing petty-only payment must restore 78 due");
  await cdp("Page.reload");
  await waitFor("reloaded app document", () => evaluate<string>("document.readyState"), (state) => state === "complete");
  await waitFor("authenticated shell after reload", () => evaluate<boolean>(
    `!!document.querySelector('[data-testid="tab-cash-management"]')`,
  ), Boolean);
  await clickTestId("tab-cash-management");
  await waitFor("cash summary to return to zero", () => evaluate<string>(
    `document.querySelector('[data-testid="card-cash-received"]')?.innerText ?? ""`,
  ), (text) => /₹\s*0(?:\.0)?\b/.test(text));
  const reversedEntries = await db.select({ id: cashEntries.id, isReversed: cashEntries.isReversed })
    .from(cashEntries).where(eq(cashEntries.merchantId, merchantId));
  assert.equal(reversedEntries.length, 2);
  assert.ok(reversedEntries.every((entry) => entry.isReversed), "Both disposable entries should be soft-reversed");

  await evaluate(`fetch("/api/logout", { method: "POST", credentials: "include" }).then(() => true)`);
  console.log("Seed Sale authenticated UI verification passed: 63,000 cash + 78 petty, petty-only payment, all reset behaviors, Cash Flow print totals, and reversal.");
  console.log(`Phone-width screenshot saved at ${phoneScreenshot}`);
} finally {
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      await evaluate(`fetch("/api/logout", { method: "POST", credentials: "include" }).then(() => true)`);
    } catch {
      // The browser may have exited before logout; session rows are removed below.
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
  if (userId !== undefined) {
    await db.delete(sessions).where(sql`${sessions.sess}->'passport'->>'user' = ${String(userId)}`);
  }
  if (merchantId !== undefined) {
    await db.delete(cashEntries).where(eq(cashEntries.merchantId, merchantId));
    await db.delete(seedTransactions).where(eq(seedTransactions.merchantId, merchantId));
    if (farmerIds.length) await db.delete(farmers).where(and(eq(farmers.merchantId, merchantId)));
    if (userId !== undefined) await db.delete(users).where(eq(users.id, userId));
    await db.delete(merchants).where(eq(merchants.id, merchantId));
  }
  await rm(browserProfile, { recursive: true, force: true });
  await pool.end();
}