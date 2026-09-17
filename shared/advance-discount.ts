/**
 * Driver advance discount.
 *
 * An advance shown as ₹30,000 at 3% means only ₹29,100 actually leaves the
 * business; the ₹900 retained belongs back in profit. Bills and receipts always
 * print the full advance, so this only ever affects P&L.
 *
 * The four profit formulas (loading default, loading freight-paid-separately,
 * bikri/sale, and the bikri lot-items save) stay deliberately separate — only
 * this add-back term is shared between them.
 */

/** Largest accepted discount percentage. */
export const MAX_ADVANCE_DISCOUNT_PERCENT = 100;

/**
 * Rupees to add back to P&L for a discounted driver advance.
 * A blank/null/invalid percent is treated as 0, so untouched transactions are
 * unaffected. Callers that exclude the advance from P&L entirely (loading with
 * freight paid separately) must not call this — there is nothing to add back.
 */
export function advanceDiscountAmount(
  advance: unknown,
  percent: unknown,
): number {
  const adv = typeof advance === "number" ? advance : parseFloat(String(advance ?? "")) || 0;
  const pct = typeof percent === "number" ? percent : parseFloat(String(percent ?? "")) || 0;
  if (!Number.isFinite(adv) || !Number.isFinite(pct)) return 0;
  if (adv <= 0 || pct <= 0) return 0;
  return (adv * Math.min(pct, MAX_ADVANCE_DISCOUNT_PERCENT)) / 100;
}
