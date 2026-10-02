---
name: Stock edit payment boundary
description: Why payment counters should not be added to ordinary stock edit payloads to fix omitted-field resets.
---

Fix omitted payment resets at the server's PATCH boundary; do not make ordinary
stock dialogs resend the paid counter from their opening snapshot.

**Why:** A payment or reversal can happen while a stock dialog is open. Resending
that snapshot can overwrite the newer payment balance without changing its
allocation or receipt history. Partial API callers must also preserve omissions.

**How to apply:** Ordinary stock edits omit payment counters. Preserve omitted
paid values and charge rates server-side so unrelated partial edits cannot alter
dues. Regression checks should use actual allocated receipts, inspect both
balances and audit records, and verify explicit reversal separately.