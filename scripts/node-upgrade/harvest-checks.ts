import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { merchants, users } from "@shared/schema";
import { db, pool } from "../../server/db";
import { hashPassword } from "../../server/auth";
import { assertIsolatedRuntimeTest } from "./assert-isolated";

// This script is only launched by the isolated runner, never against real data.
assertIsolatedRuntimeTest();
const origin = new URL(process.env.APP_URL!);
assert.equal(origin.hostname, "127.0.0.1");
const password = randomUUID();
const username = `runtime_${randomUUID()}`;
let cookie = "";
async function api(method: string, path: string, body?: unknown, expected = 200) {
  const response = await fetch(new URL(path, origin), {
    method,
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const data = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
try {
  const [merchant] = await db.insert(merchants).values({ name: `Harvest runtime test ${randomUUID()}` }).returning();
  await db.insert(users).values({
    username, password: await hashPassword(password), name: "Runtime test",
    merchantId: merchant.id, canEdit: true, isSystemAdmin: false, mustChangePassword: false,
  });
  await api("POST", "/api/login", { username, password });
  const identity = await api("GET", "/api/user");
  assert.equal(identity.merchantId, merchant.id);
  const entry = await api("POST", "/api/stock-entries", {
    purchaseDate: "2026-10-01", place: "cold_store",
    farmerName: "Runtime Harvest Farmer", farmerContact: "9000000001", village: "Runtime Village",
    lots: [{
      place: "cold_store", coldStoreName: "Runtime Cold Store",
      crop: "potato", originalBags: 10, potatoType: "Jyoti", bagType: "Ration",
      cutType: "gate_cut", size: "Medium", totalWeight: 500, pricePerKg: 10,
      bagBreakdowns: [{ size: "Medium", numberOfBags: 10, weight: 500, pricePerKg: 10 }],
    }],
  }, 201);
  const entries = await api("GET", "/api/stock-entries");
  const saved = entries.find((row: any) => row.id === entry.id);
  assert.ok(saved, "New Harvest entry must be visible");
  assert.equal(saved.lots[0].originalBags, 10);
  const lot = saved.lots[0];
  const breakdown = lot.bagBreakdowns?.[0];
  const transaction = await api("POST", "/api/transactions", {
    transactionType: "loading", transporterName: "Runtime Transport",
    partyName: "Runtime Buyer", dateOfLoading: "2026-10-02",
    vehicleNumber: "RUNTIME-TEST", totalFreight: 0, advancePayment: 0,
    revenue: 1600, freightPaidSeparately: false,
    items: [{
      inventoryKey: `${lot.id}-${breakdown?.id || "lot"}`, bagsMoved: 2,
      netWeight: 100, netWeightOverridden: true, pricePerKg: 16, amount: 1600,
    }],
  }, 201);
  assert.equal(transaction.totalBags, 2);
  assert.equal(Number(transaction.revenue), 1600);
  assert.ok(Number(transaction.totalCostOfGoods) > 0);
  assert.equal(Number(transaction.profitLoss), 1600 - Number(transaction.totalCostOfGoods));
  const after = (await api("GET", "/api/stock-entries")).find((row: any) => row.id === entry.id);
  assert.equal(after.lots[0].remainingBags, 8);
  assert.ok((await api("GET", "/api/transactions")).some((row: any) => row.id === transaction.id));
  await api("PATCH", `/api/stock-entries/${entry.id}`, { remarks: "Runtime verified" });
  const edited = (await api("GET", "/api/stock-entries")).find((row: any) => row.id === entry.id);
  assert.equal(edited.remarks, "Runtime verified");
  assert.equal(edited.lots[0].remainingBags, 8, "Remarks edit must preserve inventory");
  for (const endpoint of ["/api/dashboard/timeseries", "/api/books/profit-loss?fy=2026-27", "/api/books/balance-sheet?fy=2026-27"]) {
    await api("GET", endpoint);
  }
  await api("DELETE", `/api/transactions/${transaction.id}`);
  const restored = (await api("GET", "/api/stock-entries")).find((row: any) => row.id === entry.id);
  assert.equal(restored.lots[0].remainingBags, 10);
  await api("DELETE", `/api/stock-entries/${entry.id}`);
  assert.ok(!(await api("GET", "/api/stock-entries")).some((row: any) => row.id === entry.id));
  await api("POST", "/api/logout");
  await api("GET", "/api/user", undefined, 401);
  console.log("Harvest production-runtime checks passed: authentication, stock create/edit, loading, COGS/P&L, inventory restoration, dashboard/books, delete and logout.");
} finally {
  // The entire disposable cluster is stopped by the runner; never delete live rows.
  await pool.end();
}
