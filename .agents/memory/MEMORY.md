# Memory Index

- [Harvest Tnx# numbering](harvest-tnx-numbering.md) — harvest Tnx# is global per account per IST year (crop-agnostic); only Sr#/seed counters are per-crop.
- [Final-value rounding](final-value-rounding.md) — only FINAL money values round to whole rupees; keep shared compute helpers precise (startup backfills reuse them); round party dues at the live aggregate, mirrored across every consumer.
- [Receipt printing](receipt-printing.md) — all receipts print via hidden iframe (printHtmlDocument), never window.open; deferred print + popup blocker = blank page.
- [Mandi charge precedence](mandi-charge-precedence.md) — saved charges beat lot-derived on dialog open; lot wins only on lot/bags/weight/price edits. COGS staleness is intentional.
- [Loading P&L formula](loading-pl-formula.md) — loading overall P&L = revenue − totalCostOfGoods; COGS already bakes in mandi tax, never re-add commission/debit/mandi or you double-count.
- [Dev server staleness](dev-server-staleness.md) — Vite HMR reloads only the client; check server process start time vs file mtime before debugging "saves don't persist".
- [Farmer interest accrual](farmer-interest-accrual.md) — interest derives from per-entry cash_farmers rows; the farmers.* receivable columns are a rollup and recomputing from them claws back interest.
- [Freight settlement](freight-settlement.md) — a truck is (loading date, transporter, vehicle); freight counted once per loading session; Books shows it outside COGS.
- [Loading P&L consumers](loading-pl-consumers.md) — every place recomputing loading P&L must branch on freightPaidSeparately; startup backfills silently rewrite rows that miss it.
