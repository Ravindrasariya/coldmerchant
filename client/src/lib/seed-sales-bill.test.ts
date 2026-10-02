import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSeedSalesBill, type SeedBillTransaction } from "./seed-sales-bill";

const transaction: SeedBillTransaction = {
  transactionNumber: 5, farmerName: "Example Farmer", farmerContact: "0000000000",
  village: "Village", tehsil: "Tehsil", district: "District", state: "State",
  vehicleNumber: "TEST-123", createdAt: "2026-10-02T00:00:00+05:30",
  transportCharges: "150", otherCharges: "25", otherChargesRemarks: "Delivery",
  totalBags: 10, totalRevenue: "7000", totalDueToFarmer: "7175",
  items: [{
    serialNumber: 81, coldStoreName: "Example Store", potatoType: "Seed Potato",
    size: "Large", bagsMoved: 10, pricePerBag: "700", totalAmount: "7000",
  }],
};
const merchant = { name: "Example Merchant", address: "Example Address", contactNumber: "0000000000" };

test("header has explicit proportional sizing without application utilities", () => {
  const { html, markup } = buildSeedSalesBill(transaction, merchant, "/header.png");
  assert.match(html, /width: 100%; max-width: 100%; height: auto/);
  assert.match(html, /src="\/header.png"/);
  assert.match(html, /width: 210mm/);
  assert.match(html, /@page \{ size: A4; margin: 8mm 10mm/);
  assert.ok(!html.includes("max-h-20"));
  // Preview and output contain exactly the same bill body.
  assert.equal(html.split("<body>")[1].split("</body>")[0], markup.split("</style>")[1]);
});

test("seed party, lot, per-bag rate, charges and stored totals are preserved", () => {
  const { html } = buildSeedSalesBill(transaction, merchant);
  for (const text of ["Example Farmer", "Village, Tehsil, District, State", "TEST-123",
    "S#81 - Example Store", "Seed Potato", "Large", "Rate / bag", "₹700", "₹7,000",
    "+ ₹150", "Other (Delivery)", "+ ₹25", "₹7,175"]) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(!html.includes("<th>Weight</th>"));
  assert.match(html, /<h1>Example Merchant<\/h1>/);
  assert.ok(!html.includes("<img"));
});

test("missing optional fields and zero charges do not add blank charge lines", () => {
  const { html } = buildSeedSalesBill({
    ...transaction, village: null, tehsil: null, farmerContact: null,
    transportCharges: null, otherCharges: "0",
  }, { name: "Merchant", address: null, contactNumber: null });
  assert.ok(!html.includes("Mobile:"));
  assert.ok(!html.includes("<td>Transport"));
  assert.ok(!html.includes("<td>Other"));
  assert.match(html, /District, State/);
});

test("long bills retain every item and final total without hidden overflow", () => {
  const { html } = buildSeedSalesBill({
    ...transaction,
    items: Array.from({ length: 100 }, (_, index) => ({
      ...transaction.items[0], coldStoreName: `Store-${index + 1}`,
    })),
  }, merchant);
  assert.match(html, /Store-100/);
  assert.match(html, /₹7,175/);
  assert.ok(!html.includes('aria-hidden="true"'));
  assert.ok(!html.includes("overflow: hidden"));
  assert.ok(!html.includes("height: 297mm"));
});

test("merchant, party, item and charge text is escaped", () => {
  const { html } = buildSeedSalesBill({
    ...transaction, farmerName: '<script>alert("x")</script>',
    otherChargesRemarks: "<img onerror='x'>",
  }, { ...merchant, name: "Merchant & Sons" }, 'header" onerror="x');
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Merchant &amp; Sons/);
  assert.match(html, /src="header&quot; onerror=&quot;x"/);
});