---
name: Seed payment petty settlement
description: User accounting requirements and exact reversal policy for seed sale cash entries.
---

Seed Sale payments settle outstanding seed/receivable due with Amount + Petty
Adj. Only Amount changes cash/bank or the Cash Flow PDF's monetary columns and
totals. The user explicitly clarified that deleting the cash entry deletes the
petty settlement too, so overall due increases by Amount + Petty Adj.

**Why:** Petty Adj is a non-cash settlement, not money received.

**How to apply:** Keep actual movement separate from settlement in every
payment-history, ledger and reporting consumer. Preserve receivable-first, then
oldest-seed FIFO; do not introduce a manual seed allocation picker.

New seed cash-entry settlements intentionally preserve exact two-decimal due
reductions rather than rounding the balance after allocation. Validate against
the exact outstanding due, not the rounded display amount.

**Why:** Rounding the remaining balance would make deletion restore a different
amount than Amount + Petty Adj. Legacy seed cash entries keep their previous
reversal behavior; historical payments must not be rewritten.

**How to apply:** Treat this as an exception to the general whole-rupee
settlement-write policy. Seed sale price/revenue and other payment categories
retain their existing rounding behavior. When correcting or deleting a new
seed payment, use its original settlement destinations, not current FIFO
balances, which may already include later payments.