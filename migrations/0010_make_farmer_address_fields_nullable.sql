-- Make Tehsil/District/State optional on stock_entries and seed_transactions.
-- The user wants merchants to be able to record a harvest stock entry or a
-- seed truck load without filling in the farmer's tehsil/district/state. The
-- corresponding columns on `farmers` and `cash_farmers` are already nullable;
-- only stock_entries.{district,state} and seed_transactions.{district,state}
-- still carry NOT NULL guards. Drop them so the application-level Zod relaxation
-- in shared/schema.ts can actually be honoured by the database.

ALTER TABLE stock_entries ALTER COLUMN district DROP NOT NULL;
ALTER TABLE stock_entries ALTER COLUMN state DROP NOT NULL;
ALTER TABLE seed_transactions ALTER COLUMN district DROP NOT NULL;
ALTER TABLE seed_transactions ALTER COLUMN state DROP NOT NULL;
