// Shared building blocks for the "Panna" outstanding-dues statements (Buyer
// Panna, Aadhat Panna). These one-page statements are shared via WhatsApp
// (native share sheet) or downloaded as a PDF. The header treatment mirrors the
// Loading receipt (custom HTML template header → header image → merchant
// name/address/phone fallback) so every Panna looks identical.

export interface PannaMerchant {
  id: number;
  name: string;
  address: string | null;
  contactNumber: string | null;
  receiptHeaderImage: string | null;
  receiptHtmlTemplate: string | null;
}

const CROP_LABELS: Record<string, string> = {
  potato: "Potato",
  onion: "Onion",
  garlic: "Garlic",
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function cropLabel(crop: string): string {
  return CROP_LABELS[crop] || (crop ? crop.charAt(0).toUpperCase() + crop.slice(1) : "");
}

export function formatBiddingDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr.slice(0, 10) + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
  } catch {
    return dateStr;
  }
}

export function formatRupees(value: number): string {
  return "₹" + Math.round(value).toLocaleString("en-IN");
}

export function buildMerchantHeaderHtml(merchant: PannaMerchant): string {
  // Priority 1: merchant's custom HTML receipt template — reuse its header
  // block so the Panna matches what the party sees on loading receipts.
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
