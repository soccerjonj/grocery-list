-- 031_cook_durations.sql
--
-- How long a cook actually took, so a recipe can eventually say "usually about
-- 50 min (25 prep / 25 cook)" from your real cooks rather than the optimistic
-- times printed on the source page.
--
-- prep/cook are NULL when the cook never tapped "Prep done" — we record one
-- honest total instead of inventing a boundary.

ALTER TABLE public.recipe_cooks
  ADD COLUMN IF NOT EXISTS total_seconds integer
    CHECK (total_seconds IS NULL OR (total_seconds >= 0 AND total_seconds <= 86400)),
  ADD COLUMN IF NOT EXISTS prep_seconds  integer
    CHECK (prep_seconds  IS NULL OR (prep_seconds  >= 0 AND prep_seconds  <= 86400)),
  ADD COLUMN IF NOT EXISTS cook_seconds  integer
    CHECK (cook_seconds  IS NULL OR (cook_seconds  >= 0 AND cook_seconds  <= 86400)),
  -- { "0": 45, "3": 620 } — seconds per page index (0 = the ingredients page).
  -- Object rather than array because pages the user skimmed are simply absent.
  ADD COLUMN IF NOT EXISTS step_seconds  jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(step_seconds) = 'object');

-- recipe_cooks' RLS is a single FOR ALL household-scoped policy, so the new
-- columns are already covered — no policy changes needed.
--
-- The sync_recipe_cook_stats trigger fires on INSERT/DELETE and on
-- UPDATE OF cooked_at. Durations are written by the same INSERT that creates
-- the row (recordCook), so cook_count/last_cooked_at still stay correct. If
-- durations ever become editable after the fact, widen that UPDATE OF list.
