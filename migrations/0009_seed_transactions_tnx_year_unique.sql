-- Make Tnx# uniqueness for seed_transactions enforced at the database level.
-- Tnx# is scoped per merchant + per IST calendar year of created_at, mirroring
-- the in-app duplicate check in storage.isSeedTransactionNumberTaken /
-- getNextSeedTransactionNumber (both of which compare against getISTYear()).
--
-- created_at is `timestamp` (no tz); rows are persisted as the UTC wall-clock
-- value of `now()`, so we re-stamp it as UTC and convert to Asia/Kolkata
-- before extracting the year. The expression must stay byte-for-byte
-- identical to the one in shared/schema.ts so the in-app check and the DB
-- constraint can never disagree at the IST new-year boundary.

-- 1. Drop the previous, non-IST-safe expression index if it exists from the
--    earlier draft of this migration. Safe no-op when not present.
DROP INDEX IF EXISTS seed_transactions_merchant_tnx_year_unique;

-- 2. Resolve any pre-existing duplicates by renumbering the later row(s)
--    within each (merchant_id, transaction_number, IST year) group to the
--    next available Tnx# for that merchant+year. Seed transaction items do
--    not cache transactionNumber, so no cascade into child tables is needed.
DO $$
DECLARE
  rec RECORD;
  next_tnx INT;
BEGIN
  FOR rec IN (
    SELECT id,
           merchant_id,
           EXTRACT(YEAR FROM ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata'))::INT AS yr,
           ROW_NUMBER() OVER (
             PARTITION BY merchant_id,
                          transaction_number,
                          EXTRACT(YEAR FROM ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata'))
             ORDER BY created_at, id
           ) AS rn
    FROM seed_transactions
  ) LOOP
    IF rec.rn > 1 THEN
      SELECT COALESCE(MAX(transaction_number), 0) + 1
        INTO next_tnx
        FROM seed_transactions
        WHERE merchant_id = rec.merchant_id
          AND EXTRACT(YEAR FROM ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')) = rec.yr;

      UPDATE seed_transactions
         SET transaction_number = next_tnx
       WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- 3. Add the database-level unique guard. This prevents two concurrent
--    inserts/edits (Tnx# overrides on POST /api/seed-transactions or
--    PATCH /api/seed-transactions/:id/transaction-number) from ever ending
--    up with the same Tnx# for a given merchant within the same IST
--    calendar year of created_at.
CREATE UNIQUE INDEX IF NOT EXISTS seed_transactions_merchant_tnx_year_unique
ON seed_transactions (
  merchant_id,
  transaction_number,
  (EXTRACT(YEAR FROM ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')))
);
