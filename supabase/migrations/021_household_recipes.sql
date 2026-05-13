-- 021_household_recipes.sql
--
-- Saved recipes per household. After a user imports a recipe (URL or
-- photo) we offer to save it so the household can re-add the ingredients
-- to their shopping list on future trips without re-extracting.
--
-- ingredients is stored as JSONB matching the ExtractedIngredient shape
-- the app already uses:
--   [{ name: string, quantity?: number, unit?: string, raw: string }]

CREATE TABLE IF NOT EXISTS public.household_recipes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name         text NOT NULL,
  ingredients  jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Original source — kept so users can re-open the recipe if they want
  -- the full text/photo later.
  source_url   text,
  source_kind  text NOT NULL DEFAULT 'manual'
    CHECK (source_kind IN ('url', 'photo', 'manual')),
  added_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS household_recipes_household_id_idx
  ON public.household_recipes (household_id);

ALTER TABLE public.household_recipes ENABLE ROW LEVEL SECURITY;

-- Members of the household can do everything to their recipes.
CREATE POLICY "household_recipes_member_access"
  ON public.household_recipes
  FOR ALL
  TO authenticated
  USING (
    household_id IN (
      SELECT household_id FROM public.household_members
       WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM public.household_members
       WHERE user_id = auth.uid()
    )
  );

-- Auto-update `updated_at` on UPDATE so the UI can show "last modified".
CREATE OR REPLACE FUNCTION public.touch_household_recipe_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS household_recipes_set_updated_at ON public.household_recipes;
CREATE TRIGGER household_recipes_set_updated_at
  BEFORE UPDATE ON public.household_recipes
  FOR EACH ROW EXECUTE FUNCTION public.touch_household_recipe_updated_at();

-- Realtime so collaborators see new recipes appear immediately.
ALTER PUBLICATION supabase_realtime ADD TABLE public.household_recipes;
