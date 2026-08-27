// PRINT-ONLY helper shared by the loading receipt and the loading challan.
//
// A merchant can tick "show as a single row" on a loading transaction so the
// buyer sees only total bags / total weight / one rate instead of the
// individual lots the load was drawn from. That only makes sense when every
// lot carries the same rate, so the flag alone is never enough: the rates are
// re-checked here against the live transaction. A transaction edited later to
// have mixed rates therefore falls back to per-lot rows on its own, instead of
// printing a misleading single line.
//
// This affects presentation only — no stored figure, register or total changes.

export interface CombinableItem {
  pricePerKg: string | null;
}

export function shouldCombineBillItems(
  combineBillItems: boolean | null | undefined,
  items: CombinableItem[],
): boolean {
  if (combineBillItems !== true) return false;
  if (items.length < 2) return false;
  const rates = items.map((i) => parseFloat(i.pricePerKg || "0"));
  return rates.every((r) => r > 0) && rates.every((r) => r === rates[0]);
}
