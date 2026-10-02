export interface SeedBillItem {
  serialNumber: number;
  coldStoreName: string;
  potatoType: string;
  size: string | null;
  bagsMoved: number;
  pricePerBag: string;
  totalAmount: string;
}

export interface SeedBillTransaction {
  transactionNumber: number;
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  tehsil: string | null;
  district: string;
  state: string;
  vehicleNumber: string | null;
  transportCharges: string | null;
  otherCharges: string | null;
  otherChargesRemarks: string | null;
  totalBags: number;
  totalRevenue: string | null;
  totalDueToFarmer: string | null;
  createdAt: string;
  items: SeedBillItem[];
}

export interface SeedBillMerchant {
  name: string;
  address: string | null;
  contactNumber: string | null;
}

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);

// Keep the seed receipt's existing currency precision and stored totals.
const money = (value: string | null) =>
  `₹${parseFloat(value || "0").toLocaleString("en-IN", {
    minimumFractionDigits: 0, maximumFractionDigits: 1,
  })}`;

// Based on the harvest loading bill's A4 dimensions, 13px table text,
// party/detail grid and continuous bordered item columns. Styles are scoped:
// the preview must not change the surrounding application's tables or body.
const styles = `
  .seed-sales-bill, .seed-sales-bill * { box-sizing: border-box; }
  .seed-sales-bill { width: 210mm; padding: 8mm 10mm; margin: 0; background: #fff; color: #000; font: 14px Arial, Helvetica, sans-serif; line-height: 1.4; }
  .seed-sales-bill h1, .seed-sales-bill p { margin: 0; }
  .seed-sales-bill .bill-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
  .seed-sales-bill .bill-header img { display: block; width: 100%; max-width: 100%; height: auto; margin: 0; }
  .seed-sales-bill .bill-header h1 { font-size: 28px; font-weight: bold; text-transform: uppercase; margin-bottom: 2px; }
  .seed-sales-bill .bill-header p { font-size: 13px; margin: 2px 0; }
  .seed-sales-bill .bill-title { font-size: 14px; font-weight: bold; text-align: center; margin: 8px 0; }
  .seed-sales-bill table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; }
  .seed-sales-bill td, .seed-sales-bill th { border: 1px solid #000; padding: 5px 8px; vertical-align: top; font-size: 13px; overflow-wrap: anywhere; }
  .seed-sales-bill .party-table { margin-top: 10px; }
  .seed-sales-bill .party-table td { height: 24px; }
  .seed-sales-bill .party-details { display: flex; flex-direction: column; min-height: 90px; gap: 4px; }
  .seed-sales-bill .party-name { font-size: 15px; font-weight: bold; }
  .seed-sales-bill .party-contact { margin-top: auto; }
  .seed-sales-bill .items-table, .seed-sales-bill .summary-table { margin-top: -1px; }
  .seed-sales-bill .items-table th { background: #fff; font-weight: bold; text-align: center; padding: 6px; }
  .seed-sales-bill .items-table tbody td { border-top: none; border-bottom: none; height: 29px; }
  .seed-sales-bill .number { text-align: right; }
  .seed-sales-bill .center { text-align: center; }
  .seed-sales-bill .total-row td { font-weight: bold; border-top: 1px solid #000; border-bottom: 1px solid #000; }
  .seed-sales-bill .payable-row td { font-weight: bold; border-top: 2px solid #000; }
  .seed-sales-bill .bill-footer { margin-top: 16px; text-align: center; font-size: 11px; }
  .seed-sales-bill tr, .seed-sales-bill .bill-header, .seed-sales-bill .bill-title { break-inside: avoid; }
  .seed-sales-bill .summary-table { break-inside: avoid; }
  @page { size: A4; margin: 8mm 10mm; }
  @media print {
    .seed-sales-bill { width: 100%; padding: 0; margin: 0; }
    .seed-sales-bill thead { display: table-header-group; }
    .seed-sales-bill tfoot { display: table-row-group; }
    .seed-sales-bill { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

/** One document model for preview, hidden-iframe print, and PDF capture. */
export function buildSeedSalesBill(
  transaction: SeedBillTransaction,
  merchant: SeedBillMerchant,
  headerImageUrl?: string,
): { html: string; markup: string } {
  const header = headerImageUrl
    ? `<img src="${escapeHtml(headerImageUrl)}" alt="${escapeHtml(merchant.name)}">`
    : `<h1>${escapeHtml(merchant.name)}</h1>
       ${merchant.address ? `<p>${escapeHtml(merchant.address)}</p>` : ""}
       ${merchant.contactNumber ? `<p>Phone / फोन: ${escapeHtml(merchant.contactNumber)}</p>` : ""}`;
  const location = [transaction.village, transaction.tehsil, transaction.district, transaction.state].filter(Boolean).join(", ");
  const date = new Date(transaction.createdAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });
  const rows = transaction.items.map((item, index) => `<tr>
    <td class="center">${index + 1}</td>
    <td>S#${item.serialNumber} - ${escapeHtml(item.coldStoreName)}</td>
    <td>${escapeHtml(item.potatoType)}</td>
    <td>${escapeHtml(item.size)}</td>
    <td class="number">${item.bagsMoved}</td>
    <td class="number">${money(item.pricePerBag)}</td>
    <td class="number">${money(item.totalAmount)}</td>
  </tr>`).join("");
  // Like harvest, leave space in short bills; never fix the page height or
  // hide overflow, which would discard rows/totals on longer transactions.
  const blanks = Array(Math.max(0, 8 - transaction.items.length))
    .fill(`<tr aria-hidden="true">${"<td>&nbsp;</td>".repeat(7)}</tr>`).join("");
  const charges = [
    `<tr><td>Sale Amount / बिक्री राशि</td><td class="number">${money(transaction.totalRevenue)}</td></tr>`,
    parseFloat(transaction.transportCharges || "0") > 0
      ? `<tr><td>Transport / परिवहन</td><td class="number">+ ${money(transaction.transportCharges)}</td></tr>` : "",
    parseFloat(transaction.otherCharges || "0") > 0
      ? `<tr><td>Other${transaction.otherChargesRemarks ? ` (${escapeHtml(transaction.otherChargesRemarks)})` : ""}</td><td class="number">+ ${money(transaction.otherCharges)}</td></tr>` : "",
  ].join("");
  const content = `<div class="seed-sales-bill">
    <div class="bill-header">${header}</div>
    <div class="bill-title">Seed Sales Receipt / बीज बिक्री रसीद</div>
    <table class="party-table">
      <colgroup><col style="width:55%"><col style="width:19%"><col style="width:26%"></colgroup>
      <tbody>
        <tr><td rowspan="4"><div class="party-details">
          <div class="party-name">${escapeHtml(transaction.farmerName)}</div>
          ${location ? `<div>${escapeHtml(location)}</div>` : ""}
          ${transaction.farmerContact ? `<div class="party-contact">Mobile: ${escapeHtml(transaction.farmerContact)}</div>` : ""}
        </div></td><td>Quantity</td><td>${transaction.totalBags}</td></tr>
        <tr><td>Motor No.</td><td>${escapeHtml(transaction.vehicleNumber)}</td></tr>
        <tr><td>Bill No.</td><td>${transaction.transactionNumber}</td></tr>
        <tr><td>Bill Date</td><td>${escapeHtml(date)}</td></tr>
      </tbody>
    </table>
    <table class="items-table">
      <colgroup><col style="width:5%"><col style="width:24%"><col style="width:16%"><col style="width:12%"><col style="width:9%"><col style="width:16%"><col style="width:18%"></colgroup>
      <thead><tr><th>S#</th><th>Lot</th><th>Type</th><th>Size</th><th>Bags</th><th>Rate / bag</th><th>Value</th></tr></thead>
      <tbody>${rows}${blanks}</tbody>
      <tfoot><tr class="total-row"><td colspan="4">Total / कुल</td><td class="number">${transaction.totalBags}</td><td></td><td class="number">${money(transaction.totalRevenue)}</td></tr></tfoot>
    </table>
    <table class="summary-table">
      <colgroup><col style="width:82%"><col style="width:18%"></colgroup>
      <tbody>${charges}<tr class="payable-row"><td>Amount Payable / भुगतान योग्य</td><td class="number">${money(transaction.totalDueToFarmer)}</td></tr></tbody>
    </table>
    <div class="bill-footer">Thank you! / धन्यवाद!<br>No signature/stamp required for online receipt | ऑनलाइन रसीद पर हस्ताक्षर/मुहर आवश्यक नहीं</div>
  </div>`;
  return {
    markup: `<style>${styles}</style>${content}`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Seed Sales Receipt #${transaction.transactionNumber}</title><style>html, body { margin: 0; padding: 0; }${styles}</style></head><body>${content}</body></html>`,
  };
}