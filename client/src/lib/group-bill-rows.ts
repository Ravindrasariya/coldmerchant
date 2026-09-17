// PRINT-ONLY helper shared by the Bikri bill, the loading bill and the loading
// challan.
//
// Buyers get one printed line per marka rather than one per lot: the lots a
// load was drawn from are the merchant's business, the mark on the bags is what
// the buyer recognises. Rows carrying the same marka are therefore merged and
// their bags / weights / values added up.
//
// A blank marka is a perfectly normal marka and groups with the other blank
// rows. Matching is exact after trimming surrounding whitespace, so every other
// character (".", "/", etc.) counts.
//
// The loading bill also prints a rate, so there two rows merge only when the
// marka AND the rate are the same — merging different rates would print a rate
// that applies to neither row.
//
// This affects presentation only — no stored figure, register or total changes.

export interface BillRowItem {
  marka?: string | null;
  potatoType?: string | null;
  crop?: string | null;
  bagsMoved: number;
  netWeight: string | null;
  revenue?: string | null;
  amount?: string | null;
  pricePerKg?: string | null;
}

export interface GroupedBillRow<T extends BillRowItem> {
  marka: string;
  /** Rate shared by every row in the group; 0 when the group carries none. */
  pricePerKg: number;
  bagsMoved: number;
  netWeight: number;
  revenue: number;
  amount: number;
  /** The rows merged into this one, in their original order. */
  items: T[];
}

export function normalizeMarka(marka?: string | null): string {
  return (marka || "").trim();
}

function num(value: string | null | undefined): number {
  const n = parseFloat(value || "0");
  return Number.isFinite(n) ? n : 0;
}

/**
 * Merge printed bill rows.
 *
 * @param items    the transaction's lot rows, in display order
 * @param byRate   also require an equal ₹/Kg to merge (loading bill & challan)
 */
export function groupBillRows<T extends BillRowItem>(
  items: T[],
  byRate = false,
): GroupedBillRow<T>[] {
  const groups = new Map<string, GroupedBillRow<T>>();
  for (const item of items) {
    const marka = normalizeMarka(item.marka);
    const rate = num(item.pricePerKg);
    // Rates are compared as numbers so 14 and 14.00 count as the same.
    const key = byRate ? `${marka}\u0000${rate}` : marka;
    let group = groups.get(key);
    if (!group) {
      group = { marka, pricePerKg: rate, bagsMoved: 0, netWeight: 0, revenue: 0, amount: 0, items: [] };
      groups.set(key, group);
    }
    group.bagsMoved += item.bagsMoved || 0;
    group.netWeight += num(item.netWeight);
    group.revenue += num(item.revenue);
    group.amount += num(item.amount);
    group.items.push(item);
  }
  return Array.from(groups.values());
}
