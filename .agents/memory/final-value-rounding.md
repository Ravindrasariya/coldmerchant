---
name: Whole-rupee rounding of money values + ₹1 settlement tolerance
description: Policy for keeping party dues/payments whole-rupee, which values must stay precise, and the invariants that prevent payment 500s and stuck "partial"
---

# Policy: settlement-facing money is whole rupees; cost internals stay precise

Two layers work together and must stay in lockstep:

1. **Round-at-write (going forward).** Computed party DUES and PAYMENT fields persist as
   whole rupees the moment they are written, so new/re-saved data is clean.
2. **₹1 settlement tolerance (for legacy).** Production data lives on an external VPS and is
   NEVER migrated/backfilled, so old rows still carry paise. `RUPEE_TOLERANCE = 1` absorbs
   sub-rupee drift so legacy rows still fully settle and never stick at "partial".

The tolerance helpers (`RUPEE_TOLERANCE`, `roundRupee`, `isSettled`, `exceedsDue`) have ONE
shared definition; never redeclare the constant locally (it silently drifts out of sync).

## Round these (settlement-facing)
- Lot dues (`netPayable`, `totalCharges`, `earlyPayAmount`) in the shared lot-charge compute
  helpers' return value.
- Payment fields on EVERY settle path AND the reversal path: amount-paid / amount-received /
  cold-store-paid / seed due-to-farmer. **Reversal must round the same fields as the forward
  path** or reversals reintroduce paise (symmetry is the invariant).
- Party dues at the per-entry aggregate (`round(Σ lot netPayable) − paid`), mirrored
  IDENTICALLY in the dues-list/ledger endpoint and the payment-dialog endpoint.

## Charge-amount rounding is TYPE-SCOPED (the subtle one)
- Round ONLY the cold-store charge types — `"Cold Charges"` and `"Ware House Charges"` — at lot
  create/update write time (they ARE settlement-facing: cold-store dues derive from them).
- Leave EVERY other charge type precise, especially `"Extra Charges to Buyer"` — those feed
  `computeBreakdownCosts` (per-bag cost / COGS), which must stay precise. Rounding all charge
  amounts indiscriminately corrupts COGS; rounding none fails the task's cold-charge rounding
  requirement. The reconciliation is a single TYPE-filtered helper used on both write paths.

## Keep these PRECISE — never round (carve-outs)
- Farmer `remainingReceivable` / `pyReceivable` / `pyReceivableFinalAmount` + daily interest.
- bag-breakdown cost-per-bag and the whole COGS pipeline; seed avg-cost-per-bag.

## Invariants (the bug-prevention rules)
- **Overpay check compares against the RAW (un-rounded) due:** reject when
  `settled - due >= RUPEE_TOLERANCE`. Do NOT round the due first — rounding it lets an extra
  rupee slip through on paise rows (due 100.60, settled 101.70 = ₹1.10 overpay must reject).
  Paying the rounded-for-display due is still accepted since `|round(due) - due| < 1`. Do not
  pre-round the due at any callsite before this check.
- **Sub-₹1 residue counts as settled — always compare the RAW due, never a pre-rounded one.**
  Status checks, FIFO allocation loops, dues-listing loops, and pending-list filters all treat a
  remaining due `< RUPEE_TOLERANCE` as paid/hidden. In FIFO loops this is the easy trap: compute
  the skip-and-allocate due from the UNROUNDED basis (`Σ netPayable − paid`); a pre-rounded basis
  turns a ₹0.60 residue into ₹1.00 and allocates a phantom rupee. Keep the rounded basis only for
  the post-payment paid/partial status decision. Round dues only for DISPLAY.
- Apply this uniformly to every dues-listing path (aadhtiya, harvest farmers, cold stores, seed
  farmers, seed suppliers): per-item raw skip + final-list tolerance filter + display rounding.
  Seed-farmer dues also fold in the farmer's receivable balance — apply the tolerance to that
  inclusion for visibility, but the STORED receivable stays precise (display-only decision).
- **Startup backfill must not mass-rewrite legacy rows:** since the lot-charge helpers now
  round their output, the backfill "needs update" threshold must be `>= RUPEE_TOLERANCE` so
  pure sub-rupee rounding deltas don't rewrite every historical lot on every restart — only
  real (≥ ₹1) corrections do.
- Apply all of the above in lockstep across all five payment categories (aadhtiya, cold store,
  seed supplier, buyer, farmer) and across BOTH cash-entry methods + the reversal path.

**Why:** the reported bug was payments failing with `… exceeds due …` 500s and FIFO leaving
items stuck "partial" — validation summed raw paise dues while the dialog showed whole-rupee
dues, and an off-by-one (`> due + 1`) let an exact ₹1 overpay through.

## Seed supplier basis is intentional
Seed supplier dues are `Σ(bags × pricePerBag)` by design (charges flow to COGS, not supplier
deductions). Keep that basis; only the final sum is rounded.
