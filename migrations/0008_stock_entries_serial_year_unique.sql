-- Make Sr# uniqueness for stock_entries enforced at the database level.
-- Sr# is scoped per merchant + per calendar year of purchase_date.

-- 1. Resolve any existing duplicates by renumbering the later row(s) within
--    each (merchant_id, serial_number, year) group to the next available Sr#
--    for that merchant+year. Cascades the renumber into transaction_items
--    (which caches serial_number from the parent stock entry).
DO $$
DECLARE
  rec RECORD;
  next_serial INT;
BEGIN
  FOR rec IN (
    SELECT id,
           merchant_id,
           EXTRACT(YEAR FROM purchase_date)::INT AS yr,
           ROW_NUMBER() OVER (
             PARTITION BY merchant_id, serial_number, EXTRACT(YEAR FROM purchase_date)
             ORDER BY created_at, id
           ) AS rn
    FROM stock_entries
  ) LOOP
    IF rec.rn > 1 THEN
      SELECT COALESCE(MAX(serial_number), 0) + 1
        INTO next_serial
        FROM stock_entries
        WHERE merchant_id = rec.merchant_id
          AND EXTRACT(YEAR FROM purchase_date) = rec.yr;

      UPDATE stock_entries
         SET serial_number = next_serial,
             updated_at = NOW()
       WHERE id = rec.id;

      UPDATE transaction_items
         SET serial_number = next_serial
       WHERE lot_id IN (SELECT id FROM lots WHERE stock_entry_id = rec.id);
    END IF;
  END LOOP;
END $$;

-- 2. Add the database-level unique guard. This prevents two concurrent
--    inserts/updates from ever ending up with the same Sr# for a given
--    merchant within the same calendar year of purchase_date.
CREATE UNIQUE INDEX IF NOT EXISTS stock_entries_merchant_serial_year_unique
ON stock_entries (merchant_id, serial_number, (EXTRACT(YEAR FROM purchase_date)));
