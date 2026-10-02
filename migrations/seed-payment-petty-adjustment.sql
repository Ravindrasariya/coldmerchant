-- Additive only: keep old cash entries and legacy reversal behaviour unchanged.
BEGIN;
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS petty_adjustment numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS seed_settlement_targets jsonb;
COMMIT;