-- Percentage of the driver advance retained as a discount. NULL means 0 (no
-- discount), so existing rows keep their current profit figures. Only affects
-- P&L; printed bills and receipts always show the full advance as entered.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS advance_discount_percent numeric(5, 2);
