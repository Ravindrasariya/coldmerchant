import type { QueryClient } from "@tanstack/react-query";

/**
 * Every query key whose data can change when money or stock moves — the Cash
 * tab's ledgers and party dues, the registers those dues are derived from, and
 * the Books statements.
 *
 * Kept as ONE list because it was previously copy-pasted into each dialog's
 * mutation, and those copies drifted: adding a new Cash tab query meant the
 * screen silently went stale after editing a transaction until the user hard
 * refreshed. Add new shared keys here, never at a call site.
 *
 * Keys that belong to a single screen (e.g. ["/api/transactions", id] or
 * "/api/transactions/transporters") stay at their call site.
 */
export const CASH_RELATED_QUERY_KEYS: string[] = [
  // Cash tab — entries and party ledgers
  "/api/cash/entries",
  "/api/cash/parties",
  "/api/cash/farmers",
  "/api/cash/cold-stores",
  "/api/cash/seed-farmers",
  "/api/cash/seed-suppliers",
  "/api/cash/aadhats-with-dues",
  "/api/cash/managed-parties",
  "/api/cash/managed-farmers",
  // Cash tab — pickers inside the entry forms
  "/api/cash/aadhat-pending-entries",
  "/api/cash/cold-store-pending-charges",
  "/api/cash/buyer-pending-transactions",
  "/api/cash/freight-outstanding",
  // Registers the dues are derived from
  "/api/transactions",
  "/api/seed-transactions",
  "/api/stock-entries",
  "/api/seed-stock-entries",
  // Parties
  "/api/farmers",
  "/api/buyers",
  "/api/aadhats",
  "/api/sundry-pay",
  "/api/cold-stores/search",
  "/api/cold-store-ledger",
  // Reporting
  "/api/dashboard/timeseries",
  "/api/books/balance-sheet",
  "/api/books/profit-loss",
];

/**
 * Mark all cash/ledger/register/Books data as stale.
 *
 * Call this from any mutation that creates, edits, or deletes a transaction,
 * stock entry, or cash entry, so the Cash tab reflects the change as soon as the
 * user switches to it rather than after a page refresh.
 */
export function invalidateCashRelatedQueries(queryClient: QueryClient): void {
  for (const key of CASH_RELATED_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}
