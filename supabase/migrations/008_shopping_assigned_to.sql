-- Add assigned_to to shopping_items (mirrors pantry_items pattern)
ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS assigned_to uuid[] DEFAULT NULL;
