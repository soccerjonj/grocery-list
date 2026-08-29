-- 030_staples_aliases.sql
--
-- Three additions, all riding household_taxonomy rather than new tables — the
-- same move migration 028 made for recipe tags. That buys household scoping,
-- RLS, realtime, case-insensitive uniqueness, and the existing
-- useHouseholdTaxonomy hook for free.
--
--   type='staple'           kind='ingredient'  label=item name
--     Things you assume you always have (salt, oil, spices). They never count
--     as missing and are never added to the shopping list.
--
--   type='ingredient_alias' kind='ingredient'  label=recipe phrase
--                                              target=pantry item name
--     "high heat cooking oil" IS my "avocado oil". Household-wide, so every
--     future recipe using that phrase matches too.
--
--   type='recipe_part'      kind='recipe'      label=section name
--     Custom "Part of" sections beyond the built-in presets (Marinade, Sauce…).

-- `target` is only meaningful for aliases; nullable so every other row is
-- unaffected. Named generically rather than "pantry_item_name" so the column
-- can serve any future pointing-at-something taxonomy type.
ALTER TABLE public.household_taxonomy
  ADD COLUMN IF NOT EXISTS target text;

-- Widen BOTH checks: type and kind are each NOT NULL and both sit in the
-- unique index, exactly as 028 documented. Additive only — existing rows stay
-- valid, and re-running is safe.
ALTER TABLE public.household_taxonomy
  DROP CONSTRAINT IF EXISTS household_taxonomy_type_check;
ALTER TABLE public.household_taxonomy
  ADD  CONSTRAINT household_taxonomy_type_check
       CHECK (type IN ('category', 'location', 'recipe_tag',
                       'staple', 'ingredient_alias', 'recipe_part'));

ALTER TABLE public.household_taxonomy
  DROP CONSTRAINT IF EXISTS household_taxonomy_kind_check;
ALTER TABLE public.household_taxonomy
  ADD  CONSTRAINT household_taxonomy_kind_check
       CHECK (kind IN ('food', 'supplies', 'recipe', 'ingredient'));

-- An alias without a destination would silently match nothing, so require it
-- for that type only. NOT VALID would let bad rows linger; there are none yet.
ALTER TABLE public.household_taxonomy
  DROP CONSTRAINT IF EXISTS household_taxonomy_alias_target;
ALTER TABLE public.household_taxonomy
  ADD  CONSTRAINT household_taxonomy_alias_target
       CHECK (type <> 'ingredient_alias' OR (target IS NOT NULL AND btrim(target) <> ''));

-- Existing RLS ("taxonomy_household_access", FOR ALL to household members),
-- REPLICA IDENTITY FULL and the realtime publication already cover the new
-- rows and the new column — no policy work needed.
