# Memory Index

- [Harvest Tnx# numbering](harvest-tnx-numbering.md) — harvest Tnx# is global per account per IST year (crop-agnostic); only Sr#/seed counters are per-crop.
- [Final-value rounding](final-value-rounding.md) — only FINAL money values round to whole rupees; keep shared compute helpers precise (startup backfills reuse them); round party dues at the live aggregate, mirrored across every consumer.
- [Receipt printing](receipt-printing.md) — all receipts print via hidden iframe (printHtmlDocument), never window.open; deferred print + popup blocker = blank page.
