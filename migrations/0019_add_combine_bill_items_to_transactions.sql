-- Print-only flag: collapse all items of a loading transaction into one row on
-- the buyer receipt and challan. Defaults to false so every existing
-- transaction keeps printing per-lot rows exactly as before.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS combine_bill_items boolean NOT NULL DEFAULT false;
