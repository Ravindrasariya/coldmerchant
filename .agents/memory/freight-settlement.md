---
name: Freight settlement against a truck
description: How self-paid truck freight is identified, what counts as paid, and why Books excludes it from COGS.
---

## A truck is identified by (loading date, transporter, vehicle number), not a transaction id

One "Load A Truck" submission creates one transaction row **per buyer**, all sharing
the same `tnxGroupId`, transporter, vehicle and the *same* Total Freight value.

**Why:** summing the freight column across those rows multiplies the real freight by
the number of buyers.

**How to apply:** count freight once per loading session, then group sessions by the
date/transporter/vehicle triple. A blank vehicle number is normal in this data and is
a legitimate key value — never skip a truck for having one.

## Only trucks flagged "freight paid separately" are payable, and only Cash tab payments reduce the balance

The driver advance is deliberately **not** treated as freight paid.

**Why:** the user's stated rule — the advance is a separate arrangement with the
driver; the payable to the transporter is the full Total Freight until settled
through the Cash tab.

## Books reports freight only under Transport/Freight, never inside COGS

For freight-paid-separately trucks, harvest COGS in Books excludes Total Freight;
the freight shows up solely through the actual Transport/Freight expense entries.

**Why:** the transaction card and edit dialog already present freight as a separate
deduction, and the expense entries are real cash out. Adding it to COGS as well
double-counts it.

**Accepted consequences (the user chose these knowingly):** revenue − COGS no longer
equals the stored `profitLoss` for those trucks, and freight that has not been paid
yet is absent from Books entirely until it is paid.
