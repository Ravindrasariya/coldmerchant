-- Fix SR#4 transaction item (id 31) net weight: was stored as gross weight (6000)
-- instead of net weight with 1kg/bag deduction (6000 - 100 bags = 5900)
-- Also recalculate cost_of_goods = price_per_kg_snapshot * corrected_net_weight

UPDATE transaction_items
SET net_weight = (CAST(net_weight AS NUMERIC) - bags_moved)::text,
    cost_of_goods = (CAST(price_per_kg_snapshot AS NUMERIC) * (CAST(net_weight AS NUMERIC) - bags_moved))::text
WHERE id = 31
  AND CAST(net_weight AS NUMERIC) = 6000
  AND bags_moved = 100;