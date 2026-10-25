import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { computeNetWeight } from "../shared/utils";

// Exercise the real component and its print handler without a database, login,
// timers or network calls. Only UI dependencies and hooks are stubbed.
const source = readFileSync("client/src/components/stock-register/bill-print-dialog.tsx", "utf8");
let printed = "";
let shared = "";
const refs: Array<{ current: unknown }> = [];
const react = {
  ...React,
  useRef: (current: unknown) => {
    const ref = { current };
    refs.push(ref);
    return ref;
  },
  useState: (value: unknown) => [value, () => {}],
  useEffect: () => {},
};
const passthrough = ({ children }: any) => React.createElement("div", null, children);
const modules: Record<string, unknown> = {
  react,
  "@/lib/interest-utils": { calculateInterestOnly: () => ({ interest: 0, days: 0 }) },
  "@shared/utils": { computeNetWeight },
  "@/components/ui/dialog": Object.fromEntries(
    ["Dialog", "DialogContent", "DialogHeader", "DialogTitle"].map(name => [name, passthrough]),
  ),
  "@/components/ui/button": { Button: passthrough },
  "@/components/ui/separator": { Separator: () => null },
  "lucide-react": { Printer: () => null, Share2: () => null, Download: () => null },
  "@/hooks/use-auth": { useAuth: () => ({ user: { merchantName: "Test Merchant" } }) },
  "@tanstack/react-query": { useQuery: () => ({ data: undefined, isLoading: false }) },
  "@/lib/receipt-share": {
    shareReceiptAsPdf: async (element: { outerHTML: string }) => {
      shared = element.outerHTML;
      return { method: "download" };
    },
  },
  "@/lib/print-receipt": { printHtmlDocument: (html: string) => { printed = html; } },
  "@/hooks/use-toast": { useToast: () => ({ toast: () => {} }) },
};
const exports: any = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, {
  exports,
  require: (name: string) => {
    if (name.startsWith("@assets/")) return "";
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  },
  navigator: { userAgent: "Desktop" },
  window: { location: { origin: "https://example.test" } },
  console,
});

function find(node: any, testId: string): any {
  if (!React.isValidElement(node)) return undefined;
  const props = node.props as any;
  if (props["data-testid"] === testId) return node;
  return React.Children.toArray(props.children).map(child => find(child, testId)).find(Boolean);
}

function tables(html: string) {
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)].map(([, table]) => ({
    headings: [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(([, text]) => text),
    rows: [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
      .filter(([, row]) => row.includes("<td"))
      .map(([, row]) => [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)]
        .map(([, cell]) => cell.replace(/<[^>]+>/g, "").trim())),
  }));
}

const bd = (id: number, size: string, numberOfBags: number, weight: string | null, pricePerKg = "10") =>
  ({ id, size, numberOfBags, weight, pricePerKg, marka: null });
const headings = ["Crop", "# Bags", "Total WT (kg)", "Net Wt (kg)", "Price/kg", "Amount"];
const baseEntry = {
  id: 1, serialNumber: 1, purchaseDate: "2026-10-25", farmerName: "Test Farmer",
  farmerContact: null, village: null, tehsil: null, district: "", state: "",
  paymentStatus: "unpaid", remarks: null,
};

for (const place of ["farm_gate", "cold_store", "mandi"]) {
  const lot = (id: number, bagBreakdowns: any[], extra = {}) => ({
    id, place, crop: "potato", originalBags: 10, remainingBags: 10, cutType: "bilty_cut",
    totalWeight: "100", pricePerKg: "10", charges: [], bagBreakdowns, remarks: "Lot note / टिप्पणी", ...extra,
  });
  const entry = {
    ...baseEntry,
    lots: [
      lot(1, [bd(1, "Large", 2, "100"), bd(2, "Wastage", 3, "1", "20")], { cutType: "gate_cut" }),
      lot(2, [bd(3, "Large", 2, "100"), bd(4, "Small", 3, "80"), bd(5, "Wastage", 1, "10"), bd(6, "Medium", 0, "50")]),
      lot(3, [], { charges: [{ type: "Transport", amount: "15" }] }),
      lot(4, [], { totalWeight: null }),
      lot(5, [bd(7, "Large", 2, "0"), bd(8, "Small", 2, null), bd(9, "Chhatan", 4, "2")]),
    ],
  };
  const before = JSON.stringify(entry);
  refs.length = 0;
  const tree = exports.BillPrintDialog({ entry, open: true, onOpenChange: () => {} });
  const preview = renderToStaticMarkup(find(tree, "bill-preview"));
  find(tree, "button-print-bill").props.onClick();
  assert.deepEqual(tables(printed), tables(preview), `${place}: print and preview table parity`);
  assert.equal(JSON.stringify(entry), before, "Receipt rendering must not mutate recorded data");
  refs[0].current = { outerHTML: preview };
  await find(tree, "button-share-bill").props.onClick();
  assert.equal(shared, preview, "PDF/share must receive the exact preview markup");
  assert.ok(preview.includes("Purchase Receipt / खरीद रसीद"));
  assert.ok(preview.includes(place === "mandi" ? "Aadhat Details / आढ़तिया विवरण" : "Farmer Details / किसान विवरण"));
  assert.ok(preview.includes("Potato / आलू"));
  assert.ok(preview.includes("Transport"));
  assert.ok(preview.includes("₹15"));
  const result = tables(preview);
  if (place !== "mandi") {
    for (const table of result) assert.deepEqual(table.headings, headings);
    assert.deepEqual(result.map(table => table.rows.map(row => row.slice(1))), [
      [["5", "101.00", "98.00", "₹20", "₹980"]],
      [["2", "100.00", "98.00", "₹10", "₹980"], ["3", "80.00", "77.00", "₹10", "₹770"]],
      [["10", "100.00", "90.00", "₹10", "₹900"]],
      [["10", "—", "—", "₹10", "—"]],
      [["2", "—", "—", "₹10", "—"], ["2", "—", "—", "₹10", "—"], ["4", "2.00", "—", "₹10", "—"]],
    ]);
    assert.ok(preview.includes("₹3,630"), "Totals still use net weight");
    assert.ok(preview.includes("₹3,615"), "Farmer dues still deduct the recorded charges");
    assert.ok(preview.includes("Deductions / कटौती"));
  } else {
    assert.deepEqual(result[0].headings, [
      "Crop / फसल", "# Bags / बोरी", "Gross Wt / कुल वजन",
      "Net Wt / शुद्ध वजन", "Price/kg / मूल्य", "Amount / राशि",
    ]);
    assert.equal(result[0].rows[0][2], "101.00");
    assert.equal(result[0].rows[0][3], "101.00");
  }
  if (process.argv.includes("--fixtures")) {
    mkdirSync("generated-artifacts/receipt-weights", { recursive: true });
    const styles = readFileSync("client/src/lib/receipt-share.ts", "utf8")
      .split("const RECEIPT_BASE_STYLES = `")[1]?.split("`;")[0];
    assert.ok(styles, "PDF base styles must be available");
    writeFileSync(`generated-artifacts/receipt-weights/${place}-preview.html`,
      `<html><meta charset="utf-8"><style>${styles}</style><body>${preview}</body></html>`);
    writeFileSync(`generated-artifacts/receipt-weights/${place}-print.html`, printed);
  }
  console.log(`${place}: all row paths, clamped/missing/zero weights, print/PDF parity and preserved labels passed`);
}
