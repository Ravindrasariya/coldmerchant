# Seed Sale Petty Adj migration

This change adds two columns to the existing PostgreSQL `cash_entries` table.
It does not replace the database or recalculate historical payments. Old entries
have zero petty and a null settlement-target marker, retaining their legacy
reversal path. New seed payments save their original settlement destinations.

## Existing VPS

1. Back up the existing database using the normal VPS backup procedure.
2. Pull the updated application and install its locked dependencies (`npm ci`).
3. With the VPS's existing `DATABASE_URL` available in the environment, run:
   ```
   npx tsx scripts/apply-seed-payment-migration.ts
   ```
4. Build (`npm run build`) and restart the VPS application using its existing
   process manager.

The migration is additive, transactional and safe to rerun. Run it before
starting the updated application. It must run on the database actually used by
that VPS, not only the Replit development database. No credentials belong in
this file or shell output.

The existing post-merge setup runs the targeted migration automatically before
the project's existing schema-push step. For a VPS feature rollout, the targeted
migration is sufficient; a broad schema push is not required by this feature.

## Accounting rule

Seed Sale `amount` is actual money received; `petty_adjustment` is non-cash.
Both settle due. Cash/bank balances and Cash Flow PDF debit/credit columns and
totals use `amount` only. Deleting the payment through the existing reversal
action restores both components once to their saved destinations, without
changing cash by the petty amount.