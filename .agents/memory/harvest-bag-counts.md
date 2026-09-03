---
name: Harvest bag counts (remaining vs sold)
description: Which column is authoritative for harvest lot availability, and why the two stock screens used to disagree.
---

# Harvest bag counts

`soldBags` (on bag_breakdowns, summed onto lots) is the authoritative record of what left the yard.
`remainingBags` on both tables is DERIVED from it — never adjust it by hand at a call site.

**Why:** remainingBags used to be adjusted separately at every create/edit/delete site, so a delete could
reverse the sold history but not the remaining count (or restore only part of it when one transaction hit the
same lot through both a size row and a gate cut). The Stock Register card derives availability from soldBags
while the transaction lot dropdown and the register table read remainingBags, so drift showed up as a lot the
register said was in stock but the dropdown refused to offer.

**How to apply:** route every transaction-driven bag movement through the harvest sold-delta helper, which
records the sold change and then re-derives remainingBags for the whole lot. A gate-cut item on a lot that has
size rows must land its sold delta on those rows, or the lot total and the size rows part ways permanently.

Wastage rows are never sellable: exclude them from size-row sums and subtract them from capacity for lots with
no sellable rows.

Pre-fix rows can still be inconsistent in the live data; repairing them needs sold history rebuilt from
transaction items, and must not wipe manual (non-transaction) sell adjustments.
