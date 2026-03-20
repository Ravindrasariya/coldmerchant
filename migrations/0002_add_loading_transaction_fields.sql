-- Add loading transaction support fields to transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_type text DEFAULT 'sale';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sales_commission decimal(12, 2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_mandi_commission decimal(12, 2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_aadhat_commission decimal(12, 2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_hammali decimal(12, 2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_mandi_extra_charges decimal(12, 2);

-- Add loading item fields to transaction_items table
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS price_per_kg decimal(10, 2);
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS amount decimal(12, 2);
