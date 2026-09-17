-- Marka (bag mark) on transaction lot rows.
--
-- NULL means "never set on this row": those rows still fall back to the lot /
-- bag-breakdown marka when read, so transactions created before this column
-- keep printing the mark from their stock entry. An empty string means the
-- user deliberately cleared the mark for that row.
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS marka text;

-- The print-only "show the lots as a single row" flag is gone: bill rows are
-- now grouped by marka (plus rate on the loading bill), which covers the same
-- need without a separate setting.
ALTER TABLE transactions DROP COLUMN IF EXISTS combine_bill_items;
