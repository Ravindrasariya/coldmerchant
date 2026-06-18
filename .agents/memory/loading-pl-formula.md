---
name: Loading transaction P&L formula
description: How LOADING (truck) transaction overall P&L must be computed and why mandi tax must not be double-counted.
---

# Loading transaction overall P&L

Rule: LOADING (truck) transaction **overall** P&L = `revenue − totalCostOfGoods`.

- `totalCostOfGoods` already includes purchase-side mandi tax for Mandi lots
  (proportionate per-bag `costPerBag × bags`, after the stock-register cost-refresh).
- `revenue` already includes sales commission, mandi charges, additional charges
  and driver advance, and already subtracts debit.
- Therefore the overall P&L must **not** add sales commission / subtract debit /
  add mandi charges again on top — doing so double-counts mandi tax.

**Why:** A cost-refresh change switched loading COGS from `₹/Kg × netWeight` (no
mandi) to per-bag cost that bakes in mandi tax, but the P&L formula
`(lotAmounts − COGS) + salesCommission − debit` was not updated, so mandi tax was
double-counted (overall P&L came out wrong, e.g. showed loss when it was profit).

**How to apply:**
- Server: create, metadata PUT, and items PUT loading branches all set
  `profitLoss = revenue − totalCostOfGoods` (sale/bikri branch is different — leave it).
- Books P&L: loading COGS contributes `totalCostOfGoods` ALONE (no mandi/aadhat/
  hammali/extra/tulai/majduri/thelaBhada/palaKarai/bardan/advance add-backs), so
  Books `revenue − COGS` reconciles with the stored `profitLoss`.
- Client create + edit "Total P&L" cards must use the same `revenue − ΣcostOfGoods`
  basis as the displayed Revenue field so on-screen reconciles with server.
- Per-row P&L (the phantom-looking per-lot number) is by-design and intentionally
  NOT touched — only the overall/total P&L follows this rule.
- A startup backfill recomputes `profit_loss = round(revenue − totalCostOfGoods)`
  for existing loading rows so production self-corrects.
