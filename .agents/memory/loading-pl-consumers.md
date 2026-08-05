---
name: Loading P&L consumers must branch on freightPaidSeparately
description: Every independent recomputation of loading revenue/P&L needs the paid-separately branch, or it silently diverges from the stored value.
---

# Rule

Loading transactions have two P&L formulas, selected by `freightPaidSeparately`:

- **false (default):** driver advance is a buyer-reimbursed pass-through — it is added to
  revenue and subtracted in P&L.
- **true:** driver advance is excluded from revenue entirely, and Total Freight is subtracted
  in P&L as a cost the user bears.

Any code that recomputes loading revenue or P&L independently must implement **both**
branches. Known consumers: the create/POST path, the PATCH path, the items PUT path, the
startup backfill, and the Books profit-loss COGS add-back.

**Why:** These formulas are duplicated rather than centralised, so adding the flag to the save
paths alone leaves the others silently computing the old answer. Two real defects came from
exactly this: the startup backfill rewrote correct P&L with the advance-based formula on
*every server restart*, and Books P&L added back the advance instead of the freight, so
`revenue − COGS` no longer equalled the stored `profitLoss`.

**How to apply:** When touching loading money math, grep for the other consumers and check
each one branches. The reconciliation invariant to verify is:

```
revenue − (totalCostOfGoods + passThroughAddBacks) == stored profitLoss
```

where the add-back uses `totalFreight` when the flag is set and `advancePayment` when it is
not. Check it for at least one flag-on and one flag-off row — a change that breaks only the
flag-on rows is easy to miss when all test data has the flag off.

# Backfill caution

Startup backfills that recompute stored money values are not read-only. If their formula lags
a feature, they actively corrupt correct rows on every boot, and the damage looks like the
feature "not saving" rather than like a backfill bug.
