-- Add opened/unopened status to pantry items
ALTER TABLE pantry_items ADD COLUMN IF NOT EXISTS opened boolean NOT NULL DEFAULT false;
