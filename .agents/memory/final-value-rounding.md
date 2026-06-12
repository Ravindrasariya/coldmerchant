---
name: Whole-rupee rounding of final monetary values
description: Where/how final amounts are rounded, and why rounding must live inside the shared compute functions
---

# Final monetary values round to whole rupees (Math.round), intermediates do not

The app rounds only FINAL computed money values to the nearest whole rupee via a
`roundRupee(n)=Math.round(n)` helper in `server/routes.ts`. Rounded finals:
harvest transaction revenue/totalCostOfGoods/profitLoss (POST, PATCH, PUT-items);
seed transaction totalCost/totalRevenue/totalProfitLoss/totalDueToFarmer (POST, PATCH);
harvest lot `netPayable` and seed lot `netPayable` (the party dues). Each final value
is rounded independently — Revenue − Cost need NOT equal P&L.

Intermediates stay full precision: `transaction_items` costOfGoods/revenue, seed
`avgCostPerBag` (a per-bag COGS basis — derived from the UNROUNDED netPayable before
netPayable is rounded), per-lot `totalCharges`, charge amounts.

**Why it matters / gotcha:** `computeHarvestLotCharges` and `computeSeedLotCharges`
are reused by BOTH the create/update recompute paths AND the server-startup backfills.
So rounding had to be placed INSIDE those compute functions — otherwise a startup
backfill (which recomputes from scratch and overwrites when it differs by >0.01) would
revert any rounding done only in the recompute/route layer on the next restart.
Consequence: historical purchase dues (lot netPayable) get rounded automatically on the
next restart via the existing backfill, not only on re-save. Sales-transaction totals
have NO startup backfill, so those stay untouched for old rows until the entry is
re-saved (matching the "new entries only" intent).

**How to apply:** When changing the *output* of these compute functions, remember the
change propagates to ALL historical rows on restart via the backfills (routes.ts startup
IIFEs). For multi-lot purchases, party dues are the sum of per-lot rounded netPayables
(can differ by up to ~₹1 from rounding the exact sum) — flagged as accepted; sales
transaction totals round the single combined figure so they have no multi-lot drift.
