---
name: Farmer receivable interest accrual
description: Farmer interest derives from per-entry cash_farmers rows, not the farmers rollup columns; why recomputing from farmers.receivableEffectiveDate is wrong.
---

# Farmer receivable interest

`cash_farmers` rows are the source of truth for farmer receivable interest. Each row carries its
own `pendingDueToBePaid`, `rateOfInterest` and `effectiveDate`. The `farmers.pyReceivable*` /
`receivableInterestRate` / `receivableEffectiveDate` columns are a **denormalised rollup**, and are
only a fallback for a receivable set directly on a farmer with no `cash_farmers` row behind it.

**Rule:** accrue by summing simple interest per `cash_farmers` row from that row's own effective
date, then apply the difference against the stored total.

**Why:** a farmer accumulates multiple receivable amounts under a *single* farmer-level
`receivableEffectiveDate` that is **reset every time a new amount is added**. Recomputing from that
one date therefore claws back interest already earned before the reset — a new tranche today would
wipe months of accrued interest. Per-row dates have no such problem and need no schema change.

**How to apply:** any new interest logic, report, or backfill touching farmer receivables must go
through the per-row entries. Treating the `farmers` columns as authoritative silently loses money.

## Idempotency
All three interest branches (harvest lots, seed transactions, farmers) must recompute the full
total from stored start dates and apply only the delta — never add "one more day" incrementally.
Incremental accrual double-counts on every process restart and loses a day permanently if a
midnight run is missed. Because accrual is idempotent, it runs on startup in dev too.

Round the recomputed total to 2dp **before** comparing it with the stored 2dp value. Comparing a
full-precision total against a rounded one leaves a sub-paisa difference every run, so the balance
creeps upward restart after restart.

## Fully-paid receivables and reversals
Receivables with a zero remaining balance are excluded from accrual. This filter is required —
without it a settled receivable keeps deriving interest from its original dates and resurrects a
cleared balance.

Consequence: reversing a payment that had cleared a receivable charges interest for the whole
period the balance sat at zero. This is deliberate (a reversal means the payment never happened,
so the money was owed throughout), but it was never explicitly ratified — the user declined to
pick a rule when asked, so the behaviour stands by default. Revisit before assuming it is intended.
