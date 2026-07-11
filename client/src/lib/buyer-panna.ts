// Builds the "Buyer Panna" — a one-page outstanding-dues statement for a single
// buyer that is shared via WhatsApp (native share sheet) or downloaded as a PDF.
// The layout mirrors the Loading receipt header treatment (custom HTML template
// header → header image → merchant name/address/phone fallback) and renders a
// green-headed dues table with a final Total Due row.

import {
  buildMerchantHeaderHtml,
  cropLabel,
  escapeHtml,
  formatBiddingDate,
  formatRupees,
  type PannaMerchant,
} from "./panna-shared";

// Kept as an alias for backward compatibility with existing imports.
export type BuyerPannaMerchant = PannaMerchant;

export interface BuyerPannaEntry {
  transactionId: number;
  dateOfLoading: string | null;
  crops: string[];
  totalBags: number;
  daysSinceLoading: number;
  dueAmount: number;
}

export interface BuildBuyerPannaArgs {
  merchant: BuyerPannaMerchant;
  buyerName: string;
  buyerAddress: string | null;
  buyerContact: string | null;
  entries: BuyerPannaEntry[];
  t: (en: string, hi: string) => string;
}

// Returns a detached, body-ready <div> element holding the full Buyer Panna,
// styled with inline CSS so it renders identically inside the PDF capture
// iframe used by shareReceiptAsPdf.
export function buildBuyerPannaElement(args: BuildBuyerPannaArgs): HTMLElement {
  const { merchant, buyerName, buyerAddress, buyerContact, entries, t } = args;

  const totalDue = entries.reduce((sum, e) => sum + e.dueAmount, 0);

  const headerCellStyle = "border:1px solid #cccccc;padding:9px 8px;text-align:center;font-weight:700;color:#000000;";
  const headerHtml = `
    <tr style="background:#e8f5e9;">
      <th style="${headerCellStyle}">${t("Bidding Date", "बोली तिथि")}</th>
      <th style="${headerCellStyle}">${t("Crop", "फसल")}</th>
      <th style="${headerCellStyle}">${t("# Bags", "बैग")}</th>
      <th style="${headerCellStyle}">${t("# Days", "दिन")}</th>
      <th style="${headerCellStyle}text-align:right;">${t("Due Amount (₹)", "बकाया राशि (₹)")}</th>
    </tr>`;

  const bodyHtml = entries.map((e, i) => {
    const bg = i % 2 === 0 ? "#ffffff" : "#f4faf5";
    const crops = (e.crops && e.crops.length ? e.crops : ["potato"]).map(cropLabel).join(", ");
    const cell = `border:1px solid #cccccc;padding:7px 8px;text-align:center;`;
    return `
    <tr style="background:${bg};">
      <td style="${cell}">${formatBiddingDate(e.dateOfLoading)}</td>
      <td style="${cell}">${escapeHtml(crops)}</td>
      <td style="${cell}">${e.totalBags ?? 0}</td>
      <td style="${cell}">${e.daysSinceLoading ?? 0}</td>
      <td style="${cell}text-align:right;font-weight:600;">${formatRupees(e.dueAmount)}</td>
    </tr>`;
  }).join("");

  const totalHtml = `
    <tr style="background:#e8f5e9;">
      <td colspan="4" style="border:1px solid #1a7a3c;padding:9px 8px;text-align:right;font-weight:700;">${t("Total Due", "कुल बकाया")}</td>
      <td style="border:1px solid #1a7a3c;padding:9px 8px;text-align:right;font-weight:700;">${formatRupees(totalDue)}</td>
    </tr>`;

  const buyerBlock = `
    <div style="border:1px solid #cccccc;background:#f5f5f5;padding:12px 14px;margin-bottom:14px;">
      <div style="font-size:18px;font-weight:700;">${t("Buyer Panna", "खरीदार पन्ना")} - ${escapeHtml(buyerName)}</div>
      ${buyerAddress ? `<div style="font-size:13px;color:#333;margin-top:3px;">${escapeHtml(buyerAddress)}</div>` : ""}
      ${buyerContact ? `<div style="font-size:13px;color:#333;margin-top:3px;">${t("Phone", "फ़ोन")}: ${escapeHtml(buyerContact)}</div>` : ""}
    </div>`;

  const tableHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>${headerHtml}</thead>
      <tbody>${bodyHtml}</tbody>
      <tfoot>${totalHtml}</tfoot>
    </table>`;

  const div = document.createElement("div");
  div.style.cssText = "width:780px;padding:20px;font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000;";
  div.innerHTML = buildMerchantHeaderHtml(merchant) + buyerBlock + tableHtml;
  return div;
}
