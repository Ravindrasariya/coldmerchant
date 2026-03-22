ALTER TABLE bag_breakdowns ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

UPDATE bag_breakdowns bd
SET sort_order = ranked.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY lot_id ORDER BY id) - 1 AS rn
  FROM bag_breakdowns
) ranked
WHERE bd.id = ranked.id AND (bd.sort_order = 0 OR bd.sort_order IS NULL);
