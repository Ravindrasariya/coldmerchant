---
name: Legacy seed deletion safety
description: Why legacy receipts can conservatively block several seed records and why reversed payments must remain auditable.
---

When historical seed receipts lack saved settlement destinations, do not guess
which sale was paid from its current due or reconstruct FIFO to justify deletion.
Conservatively protect matching farmer sales until those receipts are reversed.
Supplier payments likewise lack per-entry destinations, so an active matching
supplier payment can protect multiple stock entries.

**Why:** Historical due balances and FIFO destinations can change after later
payments or edits. A guess can permit deletion of actively settled records.
The deletion requirement explicitly favors preserving accounting history over
allowing an ambiguous deletion.

**How to apply:** Use explicit settlement destinations when present, including
non-cash petty amounts. Treat absent destinations conservatively, scope all
matching to the merchant, and prefer farmer IDs when both records have them.
Ignore fully reversed payments as blockers, but keep their cash audit records
and original saved destinations. Detach obsolete reversed foreign-key
references without deleting the associated payment history.