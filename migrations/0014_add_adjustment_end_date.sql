-- Add optional interest end date to harvest lots and seed transactions.
-- When set, interest stops accruing after this date (inclusive).
-- NULL means existing behaviour: accrue until due reaches 0.
ALTER TABLE lots ADD COLUMN IF NOT EXISTS adjusted_amount_end_date date;
ALTER TABLE seed_transactions ADD COLUMN IF NOT EXISTS adjustment_end_date date;
