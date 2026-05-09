-- 015_supplies_kind.sql
-- Adds a `kind` column to pantry_items and shopping_items so non-food
-- household items (toiletries, cleaning supplies, paper goods, pet) can
-- live alongside food while being grouped separately in the UI.
--
-- All existing rows default to 'food'. The Pantry view partitions by `kind`
-- via a Food / Supplies segmented tab; the shopping list stays unified.

ALTER TABLE pantry_items
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'food';

ALTER TABLE shopping_items
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'food';

-- The Pantry view filters by (household_id, kind), so this index helps
-- the per-tab queries even though they currently fetch the full set
-- and partition client-side.
CREATE INDEX IF NOT EXISTS pantry_items_household_kind_idx
  ON pantry_items (household_id, kind);
