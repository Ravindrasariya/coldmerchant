---
name: Whole-rupee rounding of final monetary values
description: Which monetary values are rounded to whole rupees, where the rounding belongs, and the constraints that dictate that placement
---

# Rule: round only FINAL monetary values; never per-lot/per-bag/per-charge

Final values are rounded to the nearest whole rupee (`Math.round`); intermediates stay
full precision. Finals = sale transaction revenue/cost/profit, seed transaction
totals/dueToFarmer, and the party DUES (to farmer, aadhtiya, seed supplier, cold store).
Intermediates = each lot's `netPayable`, `bag_breakdowns` cost-per-bag, seed
`avgCostPerBag`, individual charge amounts.

**Multi-lot rule:** a stock entry / transaction can have many lots. Sum the lots at full
precision, then round the ONE per-entry total. Party totals are sums of those rounded
per-entry values. Each final value is rounded independently — Revenue − Cost need NOT
equal stored P&L.

## Constraint 1 — stored vs computed values (why placement matters)
- Sale-side transaction figures (revenue/cost/P&L, seed totals) are STORED columns:
  round them only on create/edit, NEVER via a bulk/startup migration. Scope is "new &
  re-saved entries forward"; historical stored rows stay until re-saved.
- Lot `netPayable` is also stored, but is reused as an INTERMEDIATE — do NOT round it
  (and do NOT round it inside the shared `computeHarvest/SeedLotCharges` helpers,
  because those helpers are also run by server-startup backfills; rounding there would
  silently rewrite historical lot values on every restart).
- Party DUES are always COMPUTED live from lot values (never stored). Round them at the
  aggregation point: sum unrounded lot `netPayable` per entry → round per entry → the
  ledger/dashboard/dialog totals are sums of those whole per-entry dues. This applies
  uniformly to old and new data because nothing historical is being mutated.

## Constraint 2 — payment dialogs must match displayed dues
Manual-allocation dialogs (aadhtiya, cold store, buyer) validate payment ≤ displayed
due. Round the per-entry due IDENTICALLY in the dialog endpoint and in the
ledger/dues-list endpoint, or the user cannot fully settle (off-by-paise residue).

## Constraint 3 — seed supplier basis is intentional
Seed supplier dues are `Σ(bags × pricePerBag)` by design (charges flow to COGS, not
supplier deductions). Keep that basis; only wrap the final sum in `Math.round`.

**How to apply:** When you change the OUTPUT of `computeHarvest/SeedLotCharges`, remember
startup backfills propagate it to all historical rows on restart — keep those helpers
precise. Put new rounding at the final aggregate (per-entry sum, party total, or the
stored transaction total on create/edit), and mirror it in every consumer of the same
due (ledger, dashboard, bill/receipt grand total, payment dialog).
