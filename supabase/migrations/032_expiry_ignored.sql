-- 032_expiry_ignored.sql
--
-- "It's still good" — let a household silence the expiry warning for things
-- that reliably outlive their printed date (honey, vinegar, dried spices).
--
--   type='expiry_ignored'  kind='food'  label=item name
--
-- Keyed by NAME rather than by pantry row id, so the answer survives finishing
-- the jar and buying another: you say "honey is fine" once, not every time.
-- That is also why this needs no column on pantry_items — the taxonomy row
-- covers the item you are looking at and every future item with that name.
--
-- Rides household_taxonomy for the same reasons 028 and 030 did: household
-- scoping, RLS, realtime, case-insensitive uniqueness and the existing
-- useHouseholdTaxonomy hook, all for free.
--
-- NOTE: the table dedupes on lower(label) while every pantry match in the app
-- keys on normalizeItemName (which also folds accents and singularizes), so
-- the read path MUST re-key through normalizeItemName — see expiryIgnore.ts.

ALTER TABLE public.household_taxonomy
  DROP CONSTRAINT IF EXISTS household_taxonomy_type_check;
ALTER TABLE public.household_taxonomy
  ADD  CONSTRAINT household_taxonomy_type_check
       CHECK (type IN ('category', 'location', 'recipe_tag',
                       'staple', 'ingredient_alias', 'recipe_part',
                       'expiry_ignored'));

-- kind is unchanged ('food' is already allowed), and the existing RLS policy,
-- REPLICA IDENTITY FULL and realtime publication already cover these rows.
