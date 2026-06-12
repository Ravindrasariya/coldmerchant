# Memory Index

- [Harvest Tnx# numbering](harvest-tnx-numbering.md) — harvest Tnx# is global per account per IST year (crop-agnostic); only Sr#/seed counters are per-crop.
- [Final-value rounding](final-value-rounding.md) — final money values round to whole rupees via roundRupee(); rounding lives inside shared compute fns because startup backfills reuse them.
