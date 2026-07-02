-- 027_household_taxonomy.sql
--
-- Household-defined custom categories and storage locations for the pantry.
-- The built-in FOOD_CATEGORIES / STORAGE_LOCATIONS (and their supplies
-- equivalents) are hardcoded in the app; this table lets a household add
-- their own that then appear as saved pills to reuse.
--
-- Items store the label string directly in pantry_items.food_category /
-- storage_location (those columns are free text), so display everywhere is
-- "known built-in label, else the raw stored value". This table only drives
-- WHICH extra pills the pickers offer.

CREATE TABLE IF NOT EXISTS public.household_taxonomy (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('category', 'location')),
  kind         text NOT NULL CHECK (kind IN ('food', 'supplies')),
  label        text NOT NULL,
  added_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- One custom entry per (household, type, kind, label) — case-insensitive so
-- "Baby food" and "baby food" don't both get created.
CREATE UNIQUE INDEX IF NOT EXISTS household_taxonomy_uniq
  ON public.household_taxonomy (household_id, type, kind, lower(label));

CREATE INDEX IF NOT EXISTS household_taxonomy_household_idx
  ON public.household_taxonomy (household_id);

ALTER TABLE public.household_taxonomy ENABLE ROW LEVEL SECURITY;

-- Members of the household can read/add/remove their custom entries.
CREATE POLICY "taxonomy_household_access" ON public.household_taxonomy
  FOR ALL
  TO authenticated
  USING (household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()))
  WITH CHECK (household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));

-- Realtime so a pill one member adds appears for the others immediately.
ALTER TABLE public.household_taxonomy REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.household_taxonomy;
