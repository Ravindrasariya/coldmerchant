-- Marks a transaction item's net weight as hand-entered by the user rather than
-- derived from the lot's average weight per bag. Nullable so existing rows keep
-- behaving exactly as before (derived).
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS net_weight_overridden boolean;
