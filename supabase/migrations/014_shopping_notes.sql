-- Add notes to shopping_items (pantry_items already has it)
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS notes text;
