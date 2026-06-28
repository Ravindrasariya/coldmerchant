// Builds the "Buyer Panna" — a one-page outstanding-dues statement for a single
// buyer that is shared via WhatsApp (native share sheet) or downloaded as a PDF.
// The layout mirrors the Loading receipt header treatment (custom HTML template
// header → header image → merchant name/address/phone fallback) and renders a
// green-headed dues table with a final Total Due row.

export interface BuyerPannaMerchant {
  id: number;
  name: string;
  address: string | null;
  contactNumber: string | null;
  receiptHeaderImage: string | null;
  receiptHtmlTemplate: string | null;
}

export interface BuyerPannaEntry {
  transactionId: number;
  dateOfLoading: string | null;
  crops: string[];
  totalBags: number;
  daysSinceLoading: number;
  dueAmount: number;
}

const CROP_LABELS: Record<string, string> = {
  potato: "Potato",
  onion: "Onion",
  garlic: "Garlic",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cropLabel(crop: string): string {
  return CROP_LABELS[crop] || (crop ? crop.charAt(0).toUpperCase() + crop.slice(1) : "");
}

function formatBiddingDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr.slice(0, 10) + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
  } catch {
    return dateStr;
  }
}

function formatRupees(value: number): string {
  return "₹" + Math.round(value).toLocaleString("en-IN");
}

function buildMerchantHeaderHtml(merchant: BuyerPannaMerchant): string {
  // Priority 1: merchant's custom HTML receipt template — reuse its header
  // block so the Panna matches what the buyer sees on loading receipts.
  if (merchant.receiptHtmlTemplate) {
    const filled = merchant.receiptHtmlTemplate
      .split("{{merchantName}}").join(escapeHtml(merchant.name || ""))
      .split("{{merchantAddress}}").join(escapeHtml(merchant.address || ""))
      .split("{{merchantContact}}").join(escapeHtml(merchant.contactNumber || ""));
    const match = filled.match(/<div class="header"[\s\S]*?<\/div>/i);
    if (match) {
      return `<div style="border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:16px;text-align:center;">${match[0]}</div>`;
    }
  }

  // Priority 2: uploaded header image.
  if (merchant.receiptHeaderImage) {
    return `<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:16px;">
      <img src="/api/merchants/${merchant.id}/receipt-header" alt="${escapeHtml(merchant.name || "")}" style="max-height:96px;display:block;margin:0 auto;object-fit:contain;" crossorigin="anonymous" />
    </div>`;
  }

  // Priority 3: text header matching the default loading template.
  return `<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:16px;">
    <h1 style="font-size:28px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:0 0 2px;">${escapeHtml(merchant.name || "")}</h1>
    ${merchant.address ? `<p style="font-size:13px;margin:2px 0;">${escapeHtml(merchant.address)}</p>` : ""}
    ${merchant.contactNumber ? `<p style="font-size:13px;margin:2px 0;">Phone : Mobile &ndash; ${escapeHtml(merchant.contactNumber)}</p>` : ""}
    <p style="font-size:12px;margin-top:6px;">Commission Agent &amp; Order Suppliers of Potato, Onion, Garlic, Ginger &amp; Arbi</p>
  </div>`;
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

  const headerCellStyle = "border:1px solid #ffffff;padding:9px 8px;text-align:center;font-weight:600;color:#ffffff;";
  const headerHtml = `
    <tr style="background:#1a7a3c;">
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
