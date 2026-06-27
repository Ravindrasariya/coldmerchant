export function computeNetWeight(weight: number, bags: number, place?: string | null): number {
  if (weight <= 0) return 0;
  if (place === "mandi") return weight;
  return Math.max(0, weight - bags);
}

// ---------------------------------------------------------------------------
// Shared rupee-rounding + ₹1 settlement tolerance helpers.
// Dues and payments are rounded to whole rupees at write time (going forward),
// and a ₹1 tolerance absorbs sub-rupee drift on existing (pre-fix) paise rows
// without any data migration. Use these everywhere a payment is validated,
// settled, or a status is decided so all categories behave identically.
// ---------------------------------------------------------------------------
export const RUPEE_TOLERANCE = 1;

// Round a money value to a whole rupee.
export function roundRupee(n: number): number {
  return Math.round(n);
}

// A remaining due under ₹1 counts as fully settled ("paid"); clamp residue to 0.
export function isSettled(due: number): boolean {
  return due < RUPEE_TOLERANCE;
}

// Reject a payment only when the settled amount overpays the ACTUAL (raw) due by
// ₹1 or more. Compare against the un-rounded due: rounding the due first would let
// an extra rupee slip through on legacy paise rows (e.g. due 100.60, settled 101.70
// is a ₹1.10 overpay and must be rejected). Paying the rounded-for-display due is
// still accepted because |roundRupee(due) - due| < ₹1.
export function exceedsDue(settled: number, due: number): boolean {
  return settled - due >= RUPEE_TOLERANCE;
}

// Round ONLY the settlement-facing cold-store charge amounts ("Cold Charges" and
// "Ware House Charges") to whole rupees at write time. Every other charge type is
// left untouched on purpose — non-cold charges (e.g. "Extra Charges to Buyer") feed
// the per-bag cost / COGS pipeline, which must stay precise.
const COLD_STORE_CHARGE_TYPES = ["Cold Charges", "Ware House Charges"];
export function roundColdStoreChargeAmounts<
  T extends { type?: string; amount?: number | string },
>(charges: T[] | null | undefined): T[] | null | undefined {
  if (!charges) return charges;
  return charges.map((c) => {
    if (!c || typeof c.type !== "string" || !COLD_STORE_CHARGE_TYPES.includes(c.type)) {
      return c;
    }
    const n = parseFloat(String(c.amount));
    return Number.isFinite(n) ? { ...c, amount: roundRupee(n) } : c;
  });
}
