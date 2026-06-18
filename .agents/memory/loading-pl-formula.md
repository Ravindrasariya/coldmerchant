---
name: Loading transaction P&L formula
description: How LOADING (truck) transaction overall P&L must be computed — net out pass-through charges, keep mandi inside COGS, and always recompute COGS live.
---

# Loading transaction overall P&L

Rule: LOADING (truck) transaction **overall** P&L =
`revenue − liveCOGS − additionalCharges − advancePayment`
where `additionalCharges = tulai + majduri + thelaBhada + palaKarai + bardan`
and `advancePayment` = driver advance.

- `liveCOGS` = `totalCostOfGoods` recomputed from the **current** stock-register
  per-bag cost (proportionate `costPerBag × bags`), NOT a stale stored value.
- Mandi/aadhat/hammali/extra tax stays **inside** COGS for Mandi lots and cancels
  via `revenue − COGS`. Do **not** subtract mandi again — that double-counts it.
  Mandi sanity check must hold: `revenue 98,950 − COGS 96,250 = 2,700`.
- Only the pass-through labour charges (tulai/majduri/thelaBhada/palaKarai/bardan)
  and driver advance are added to revenue but are NOT real margin, so they must be
  netted back out of P&L. For a farm-gate lot (mandi%=0, only sales commission),
  this is the difference between an inflated P&L and the correct one
  (verified: `38,359 − 36,756 − 500 = 1,103` ✓).

**Why:** Two bugs combined to overstate farm-gate loading P&L (card showed ₹7,205,
correct ≈ ₹1,103): (A) pass-through charges + driver advance were baked into revenue
but never subtracted from P&L; (B) save paths and the startup backfill reused a STALE
stored `totalCostOfGoods` instead of recomputing it, so the card never corrected even
after Save.

**How to apply:**
- Server: ALL loading write paths — create, metadata PUT, items PUT — set
  `profitLoss = revenue − liveCOGS − additionalCharges − advancePayment`.
  - Metadata PUT and the startup backfill must **recompute live COGS** (helper
    `recomputeTxnTotalCogs(items, merchantId, isLoading)` in `server/routes.ts`) and
    persist `totalCostOfGoods` from it. The sale/bikri branch keeps using the stale
    persisted COGS — leave it; only loading recomputes live.
- Books P&L: loading COGS must add back `additionalCharges + advancePayment` on top
  of `totalCostOfGoods` so Books `revenue − COGS` reconciles with stored `profitLoss`.
- Client create + edit "Total P&L" cards subtract `additionalCharges + driverAdvance`
  on the same `revenue − ΣcostOfGoods` basis so on-screen matches server.
- Per-row P&L (the per-lot number) is by-design and intentionally NOT touched —
  only the overall/total P&L follows this rule. Sale/bikri P&L is also untouched.
- Reconciliation invariant (verify in DB):
  `profit_loss = revenue − total_cost_of_goods − additional − advance` for every
  `transaction_type='loading'` row.
