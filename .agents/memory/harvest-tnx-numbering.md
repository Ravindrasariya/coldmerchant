---
name: Harvest transaction numbering is global, not per-crop
description: Harvest Tnx# allocation ignores crop despite replit.md implying per-crop sequences
---

# Harvest Tnx# is global per account per IST year (crop-agnostic)

The harvest "next transaction number" allocator accepts a `crop` argument but **ignores
it** — it allocates the next sequential number across all crops for the merchant in the
current IST year. So harvest Tnx# is sequential across all crops together (e.g. #1
garlic, #2 potato are valid). Per-item crop lives on `lots.crop`, not on
`transaction_items`; enrich transaction items from the joined lot to know an item's crop.

**Why it matters:** `replit.md` lumps "transaction number sequences" in with per-crop
serial-number sequences, which is misleading. Only the **Sr#** on stock entries (and
seed counters) is per-crop; the harvest **Tnx#** is not.

**How to apply:** Any feature that mixes crops in one transaction (e.g. multi-crop
truck loading) needs no numbering special-casing. The transaction-level `crop` field
(set from the first lot) only seeds the register crop filter/badge default — never use
it to gate or split Tnx# allocation.
