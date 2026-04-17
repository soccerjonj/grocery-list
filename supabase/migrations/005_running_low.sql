-- Add running_low flag to pantry items
ALTER TABLE pantry_items ADD COLUMN IF NOT EXISTS running_low boolean NOT NULL DEFAULT false;
