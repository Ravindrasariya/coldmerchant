# Memory Index

- [Harvest Tnx# numbering](harvest-tnx-numbering.md) — harvest Tnx# is global per account per IST year (crop-agnostic); only Sr#/seed counters are per-crop.
- [Final-value rounding](final-value-rounding.md) — only FINAL money values round to whole rupees; keep shared compute helpers precise (startup backfills reuse them); round party dues at the live aggregate, mirrored across every consumer.
- [Receipt printing](receipt-printing.md) — all receipts print via hidden iframe (printHtmlDocument), never window.open; deferred print + popup blocker = blank page.
- [Mandi charge precedence](mandi-charge-precedence.md) — saved charges beat lot-derived on dialog open; lot wins only on lot/bags/weight/price edits. COGS staleness is intentional.
- [Loading P&L formula](loading-pl-formula.md) — loading overall P&L = revenue − totalCostOfGoods; COGS already bakes in mandi tax, never re-add commission/debit/mandi or you double-count.
