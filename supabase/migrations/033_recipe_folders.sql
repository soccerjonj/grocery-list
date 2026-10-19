-- 033_recipe_folders.sql
--
-- Folders for the recipe library. A recipe has at most ONE folder — its home —
-- which is why this is a nullable text column rather than an array. Tags stay
-- exactly as they are, for the cross-cutting labels a recipe can have several
-- of; folders answer "where does this live", tags answer "what is it like".
--
--   household_recipes.folder   = the folder name, or NULL for unfiled
--   type='recipe_folder' kind='recipe' = the household's folder vocabulary
--
-- Same free-text-column + taxonomy-vocabulary pairing that pantry already uses
-- for food_category and storage_location: the column holds the label, the
-- taxonomy row makes it offerable in the picker. There is deliberately no FK,
-- matching tags — deleting a folder from the vocabulary leaves the recipes
-- alone rather than silently reorganising them.

ALTER TABLE public.household_recipes
  ADD COLUMN IF NOT EXISTS folder text;

-- Browsing a folder filters by (household_id, folder); tiny libraries don't
-- need this, but it costs nothing and matches how the page queries.
CREATE INDEX IF NOT EXISTS household_recipes_folder_idx
  ON public.household_recipes (household_id, folder)
  WHERE folder IS NOT NULL;

-- Widen the taxonomy type CHECK again — the 028 / 030 / 032 precedent. 'recipe'
-- is already an allowed kind, so only `type` changes. Additive: existing rows
-- stay valid and re-running is safe.
ALTER TABLE public.household_taxonomy
  DROP CONSTRAINT IF EXISTS household_taxonomy_type_check;
ALTER TABLE public.household_taxonomy
  ADD  CONSTRAINT household_taxonomy_type_check
       CHECK (type IN ('category', 'location', 'recipe_tag',
                       'staple', 'ingredient_alias', 'recipe_part',
                       'expiry_ignored', 'recipe_folder'));

-- RLS, REPLICA IDENTITY FULL and the realtime publication already cover both
-- tables and the new column — no policy work needed.
