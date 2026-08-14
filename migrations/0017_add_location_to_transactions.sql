-- Optional delivery location for a loading transaction. A buyer can have several
-- locations, so this belongs to the transaction rather than the buyer record.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS location text;
