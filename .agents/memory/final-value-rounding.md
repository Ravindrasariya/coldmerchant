---
name: Whole-rupee rounding of money values + ₹1 settlement tolerance
description: How dues/payments are kept whole-rupee (round-at-write + ₹1 tolerance), which values stay precise, and the constraints that dictate placement
---

# Rule: money the user pays/settles is whole rupees; cost internals stay precise

Two layers work together and must stay in lockstep:

1. **Round-at-write (going forward).** Computed party DUES and PAYMENT fields are
   rounded to whole rupees the moment they are written, so new/re-saved data is clean.
2. **₹1 settlement tolerance (for legacy).** Production data lives on an external VPS and
   is NEVER migrated/backfilled, so old rows still carry paise. A `RUPEE_TOLERANCE = 1`
   net absorbs sub-rupee drift so legacy rows still settle and never stick at "partial".

`RUPEE_TOLERANCE`, `roundRupee`, `isSettled`, `exceedsDue`, `roundChargeAmounts` live in
**`shared/utils.ts`** — ONE shared definition imported by both `routes.ts` and
`storage.ts`. Do NOT redeclare the constant locally (it silently drifts).

## What gets rounded at write time
- Lot dues from `computeHarvest/SeedLotCharges`: `netPayable`, `totalCharges`,
  `earlyPayAmount` are rounded in the helper return. `lot.charges[].amount` is rounded via
  `roundChargeAmounts` at both lot create and update write sites.
- Payment fields on every settle AND reversal path (forward FIFO, manual allocation, and
  `reverseCashEntry`): `stockEntries.amountPaid`, `seedStockEntries.amountPaid`,
  `transactions.amountReceived`, `lots.coldStorageChargesPaid`,
  `seedLots.coldStoreChargesPaid`, seed `totalDueToFarmer`. Reversal writes must round the
  SAME fields as the forward path or reversals reintroduce paise (symmetry).
- Per-entry aggregate due = `Math.round(Σ lot.netPayable) − amountPaid`, mirrored
  identically in the dues-list/ledger endpoint and the payment-dialog endpoint.

## What stays PRECISE (carve-outs — never round)
- Farmer `remainingReceivable` / `pyReceivable` / `pyReceivableFinalAmount` + daily interest.
- `bag_breakdowns.cost_per_bag` and the whole COGS pipeline; seed `avgCostPerBag`.

## Constraint — startup backfill must not mass-rewrite legacy rows
`computeHarvest/SeedLotCharges` are also run by a server-startup backfill. Now that the
helper rounds, the backfill's "needs update" threshold MUST be `>= RUPEE_TOLERANCE`
(not `> 0.01`), so pure sub-rupee rounding deltas do NOT rewrite every historical lot on
restart. Only real corrections (≥ ₹1, e.g. the Gate Cut Wastage fix) rewrite.

## Constraint — tolerance helpers, used in lockstep across ALL five payment categories
(aadhtiya, cold store, seed supplier, buyer, farmer) in BOTH `createCashEntry` and
`createCashEntryWithFIFO`, plus `reverseCashEntry`:
- Overpay validation rejects via `exceedsDue(settled, due)` = `settled - due >= 1` using the
  RAW (un-rounded) due — NOT `roundRupee(due)`. Rounding the due first lets an extra rupee
  slip in on legacy paise rows (due 100.60, settled 101.70 = ₹1.10 overpay must reject). All
  callsites must pass the raw due (do not `Math.round` it before validation); paying the
  rounded-for-display due is still accepted since `|roundRupee(due) - due| < 1`. This replaced
  the buggy `> due + 1` which let exactly +₹1 through.
- Status checks mark "paid"/"due" when the remaining due/paid `< RUPEE_TOLERANCE`.
- FIFO allocation loops AND dues-listing loops skip when the due `< RUPEE_TOLERANCE`, so a
  sub-rupee residue is treated as settled and never sticks an item at "partial".
- Pending-list endpoints round each due + PY balance and hide dues `< 1`.

**Why:** the bug was payments failing with `… exceeds due …` 500s and FIFO leaving items
stuck "partial" because validation summed raw (paise) `netPayable` while the dialog showed
`roundRupee(netPayable)`; the off-by-one was `> due + 1` allowing an exact ₹1 overpay.
**How to apply:** keep round-at-write + tolerance + status/guard checks in lockstep across
all five categories and across forward AND reversal paths; keep the carve-outs precise.

## Seed supplier basis is intentional
Seed supplier dues are `Σ(bags × pricePerBag)` by design (charges flow to COGS, not supplier
deductions). Keep that basis; only the final sum is rounded.
