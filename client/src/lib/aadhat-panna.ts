// Builds the "Aadhat Panna" — a one-page outstanding-dues statement for a single
// aadhat (aadhtiya) that is shared via WhatsApp (native share sheet) or
// downloaded as a PDF. Mirrors the Buyer Panna layout (shared merchant header +
// green-headed dues table + final Total Due row), but sourced from the aadhat's
// due stock entries plus an optional Previous Year Payable opening line.

import {
  buildMerchantHeaderHtml,
  cropLabel,
  escapeHtml,
  formatBiddingDate,
  formatRupees,
  type PannaMerchant,
} from "./panna-shared";

export type { PannaMerchant };

export interface AadhatPannaEntry {
  stockEntryId: number;
  serialNumber: number;
  crop: string;
  purchaseDate: string | null;
  totalBags: number;
  daysSince: number;
  dueAmount: number;
}

export interface BuildAadhatPannaArgs {
  merchant: PannaMerchant;
  aadhatName: string;
  aadhatAddress: string | null;
  aadhatContact: string | null;
  entries: AadhatPannaEntry[];
  pyPayable: number;
  t: (en: string, hi: string) => string;
}

// Returns a detached, body-ready <div> element holding the full Aadhat Panna,
// styled with inline CSS so it renders identically inside the PDF capture
// iframe used by shareReceiptAsPdf.
export function buildAadhatPannaElement(args: BuildAadhatPannaArgs): HTMLElement {
  const { merchant, aadhatName, aadhatAddress, aadhatContact, entries, pyPayable, t } = args;

  const showPy = pyPayable >= 1;
  const totalDue = (showPy ? pyPayable : 0) + entries.reduce((sum, e) => sum + e.dueAmount, 0);

  const headerCellStyle = "border:1px solid #cccccc;padding:9px 8px;text-align:center;font-weight:700;color:#000000;";
  const headerHtml = `
    <tr style="background:#e8f5e9;">
      <th style="${headerCellStyle}">${t("Sr No", "क्र.")}</th>
      <th style="${headerCellStyle}">${t("Date", "तारीख")}</th>
      <th style="${headerCellStyle}">${t("Crop", "फसल")}</th>
      <th style="${headerCellStyle}">${t("# Bags", "बैग")}</th>
      <th style="${headerCellStyle}">${t("# Days", "दिन")}</th>
      <th style="${headerCellStyle}text-align:right;">${t("Due Amount (₹)", "बकाया राशि (₹)")}</th>
    </tr>`;

  const cell = `border:1px solid #cccccc;padding:7px 8px;text-align:center;`;

  const pyHtml = showPy
    ? `
    <tr style="background:#ffffff;">
      <td colspan="5" style="${cell}text-align:left;font-weight:600;">${t("Previous Year Payable", "पिछले वर्ष का देय")}</td>
      <td style="${cell}text-align:right;font-weight:600;">${formatRupees(pyPayable)}</td>
    </tr>`
    : "";

  const bodyHtml = entries.map((e, i) => {
    const rowIndex = showPy ? i + 1 : i;
    const bg = rowIndex % 2 === 0 ? "#ffffff" : "#f4faf5";
    return `
    <tr style="background:${bg};">
      <td style="${cell}">${e.serialNumber ?? "—"}</td>
      <td style="${cell}">${formatBiddingDate(e.purchaseDate)}</td>
      <td style="${cell}">${escapeHtml(cropLabel(e.crop || "potato"))}</td>
      <td style="${cell}">${e.totalBags ?? 0}</td>
      <td style="${cell}">${e.daysSince ?? 0}</td>
      <td style="${cell}text-align:right;font-weight:600;">${formatRupees(e.dueAmount)}</td>
    </tr>`;
  }).join("");

  const totalHtml = `
    <tr style="background:#e8f5e9;">
      <td colspan="5" style="border:1px solid #1a7a3c;padding:9px 8px;text-align:right;font-weight:700;">${t("Total Due", "कुल बकाया")}</td>
      <td style="border:1px solid #1a7a3c;padding:9px 8px;text-align:right;font-weight:700;">${formatRupees(totalDue)}</td>
    </tr>`;

  const aadhatBlock = `
    <div style="border:1px solid #cccccc;background:#f5f5f5;padding:12px 14px;margin-bottom:14px;">
      <div style="font-size:18px;font-weight:700;">${t("Aadhat Panna", "आढ़त पन्ना")} - ${escapeHtml(aadhatName)}</div>
      ${aadhatAddress ? `<div style="font-size:13px;color:#333;margin-top:3px;">${escapeHtml(aadhatAddress)}</div>` : ""}
      ${aadhatContact ? `<div style="font-size:13px;color:#333;margin-top:3px;">${t("Phone", "फ़ोन")}: ${escapeHtml(aadhatContact)}</div>` : ""}
    </div>`;

  const tableHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>${headerHtml}</thead>
      <tbody>${pyHtml}${bodyHtml}</tbody>
      <tfoot>${totalHtml}</tfoot>
    </table>`;

  const div = document.createElement("div");
  div.style.cssText = "width:780px;padding:20px;font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000;";
  div.innerHTML = buildMerchantHeaderHtml(merchant) + aadhatBlock + tableHtml;
  return div;
}
