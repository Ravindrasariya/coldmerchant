---
name: Seed inventory write isolation
description: Why all inventory-changing seed edits must share deletion's complete transactional read/write boundary.
---

Seed inventory-changing operations must serialize their complete
read/validate/write operation with deletion, including initial reads used to
derive remaining bags, price snapshots, or history. Locking only deletion and
payment/sale creation is insufficient.

**Why:** A concurrent sale edit can reinsert surviving items before deletion
rebuilds inventory, then apply its bag delta afterward and count the same bags
twice. A stock edit can overwrite restored bags with a value calculated from a
pre-deletion snapshot.

**How to apply:** Acquire the shared merchant seed-activity lock before reads.
Keep seed reads, item replacement, lot counts, charges, and edit history on the
same transaction client. Do not mutate the singleton storage object's client.
Send success only after commit and roll back all earlier writes on a late
validation failure. Test both orderings of sale-edit/delete and stock-edit/delete,
not only payment/create races.