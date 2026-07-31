---
name: Mandi charge precedence in the loading edit dialog
description: Saved mandi charges beat lot-derived ones on open; the lot only wins again when the user edits lots/bags/weight/price. Contrast with COGS, which is deliberately stale until save.
---

# Mandi charge precedence (loading transactions)

The four mandi charges — Mandi Commission, Aadhat Commission, Hammali, Extra Charges —
are auto-derived from the lot proportionately (`lot charge × bags selected ÷ lot original
bags`) but are **user-overridable**. Precedence:

- **Opening the edit dialog** — the SAVED amounts win. Nothing may re-derive them from
  the lot. Opening, or opening and saving untouched, must leave stored values identical.
- **Editing lots/bags/weight/price** — the LOT wins. All four reset from the lot tables
  wholesale and any override is discarded. This is a reset, not a proportionate scaling
  of the override (the user chose this explicitly).

**Why:** bills print from the stored values. Any on-open re-derivation makes the dialog
contradict the bill, and one unrelated save then persists the wrong number. The charges
sit inside both Revenue and COGS and largely cancel in P&L, so a wrong charge shows up as
inflated Revenue on the customer-facing bill while the P&L card still looks right — the
reason this class of bug hides for a long time.

**How to apply:**
- Any effect that writes a charge amount into the form must be gated so it cannot fire on
  mount. Seeding the % / rate boxes from lot rates is equivalent to overwriting the
  amounts, because a downstream effect multiplies rate × base back into the form.
- Back-derive the rate boxes strictly from the saved amount (`saved ÷ base`), never from
  the lot rate — a lot-derived rate on a transaction with no stored amount displays a
  charge that isn't actually saved.
- Rates are rounded to 2dp, so `base × rate` does not round-trip to the saved amount.
  Display charge amounts from the form value, not recomputed, and suppress the rate×base
  effect for the render that a lot-driven recompute triggers.

## Contrast: COGS is intentionally stale
COGS on the transactions register deliberately does NOT track the Stock Register live. It
updates only when a user opens and saves that transaction, so the save acts as a review
step and costs never shift silently after a lot is repriced. Do not "fix" this.
