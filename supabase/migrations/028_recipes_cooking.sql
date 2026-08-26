-- 028_recipes_cooking.sql
--
-- Turns `household_recipes` from a shopping-list helper (name + ingredients)
-- into a real cookbook you can cook from: steps, servings, times, photo,
-- notes, tags, per-person ratings, and cook history.
--
-- BACKWARD COMPATIBILITY IS MANDATORY. Households already have saved recipes
-- whose `ingredients` rows look like {name, quantity?, unit?, raw}. Every
-- column added here is nullable or defaulted, and the ingredients shape is
-- only EXTENDED (optional `group` key per entry) — never reshaped. Existing
-- rows stay valid and render unchanged with NO data backfill.

-- ── New recipe columns ────────────────────────────────────────────────
ALTER TABLE public.household_recipes
  -- Ordered cooking steps: [{ text: string, group?: string }]
  ADD COLUMN IF NOT EXISTS steps          jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS servings       integer,
  ADD COLUMN IF NOT EXISTS servings_unit  text,     -- "servings", "cookies"
  ADD COLUMN IF NOT EXISTS prep_minutes   integer,
  ADD COLUMN IF NOT EXISTS cook_minutes   integer,
  ADD COLUMN IF NOT EXISTS description    text,
  ADD COLUMN IF NOT EXISTS notes          text,
  -- image_url = what renders. image_path = the Storage object key, kept so
  -- deletion/replacement doesn't have to parse the key back out of a URL.
  ADD COLUMN IF NOT EXISTS image_url      text,
  ADD COLUMN IF NOT EXISTS image_path     text,
  -- Tag LABELS stored verbatim, exactly like pantry_items.food_category does
  -- for custom categories. household_taxonomy only drives which pills the
  -- picker offers — so no join table and no extra realtime channel.
  ADD COLUMN IF NOT EXISTS tags           text[]  NOT NULL DEFAULT '{}'::text[],
  -- Denormalized cook stats so the library can sort by "recently/most cooked"
  -- without an aggregate join. recipe_cooks stays the source of truth; these
  -- are a derived cache maintained by the trigger below.
  ADD COLUMN IF NOT EXISTS last_cooked_at timestamptz,
  ADD COLUMN IF NOT EXISTS cook_count     integer NOT NULL DEFAULT 0;

-- Same http(s)-only guard migration 022 put on source_url: image_url is
-- rendered into an <img src>, so a javascript:/data: value must be impossible.
ALTER TABLE public.household_recipes
  DROP CONSTRAINT IF EXISTS household_recipes_image_url_http;
ALTER TABLE public.household_recipes
  ADD  CONSTRAINT household_recipes_image_url_http
       CHECK (image_url IS NULL OR image_url ~* '^https?://');

ALTER TABLE public.household_recipes
  DROP CONSTRAINT IF EXISTS household_recipes_sane_numbers;
ALTER TABLE public.household_recipes
  ADD  CONSTRAINT household_recipes_sane_numbers CHECK (
    (servings     IS NULL OR (servings     >  0 AND servings     <= 200))   AND
    (prep_minutes IS NULL OR (prep_minutes >= 0 AND prep_minutes <= 10080)) AND
    (cook_minutes IS NULL OR (cook_minutes >= 0 AND cook_minutes <= 10080))
  );

ALTER TABLE public.household_recipes
  DROP CONSTRAINT IF EXISTS household_recipes_steps_is_array;
ALTER TABLE public.household_recipes
  ADD  CONSTRAINT household_recipes_steps_is_array
       CHECK (jsonb_typeof(steps) = 'array');

ALTER TABLE public.household_recipes
  DROP CONSTRAINT IF EXISTS household_recipes_tags_len;
ALTER TABLE public.household_recipes
  ADD  CONSTRAINT household_recipes_tags_len
       CHECK (array_length(tags, 1) IS NULL OR array_length(tags, 1) <= 24);

-- Paste-raw-text is a distinct provenance from typing one in by hand.
-- This WIDENS the allowed set, so no existing row can violate it.
ALTER TABLE public.household_recipes
  DROP CONSTRAINT IF EXISTS household_recipes_source_kind_check;
ALTER TABLE public.household_recipes
  ADD  CONSTRAINT household_recipes_source_kind_check
       CHECK (source_kind IN ('url', 'photo', 'manual', 'text'));

CREATE INDEX IF NOT EXISTS household_recipes_tags_gin
  ON public.household_recipes USING GIN (tags);
CREATE INDEX IF NOT EXISTS household_recipes_household_cooked_idx
  ON public.household_recipes (household_id, last_cooked_at DESC NULLS LAST);

-- ── Recipe tags reuse household_taxonomy for the PILL SET ─────────────
-- Both `type` and `kind` are NOT NULL and both sit in its unique index, so
-- BOTH checks widen; recipe tags are (type='recipe_tag', kind='recipe').
-- This gives us the existing hook, RLS, realtime, CustomPillGroup UI, and
-- case-insensitive uniqueness for free. Both statements only ADD allowed
-- values, so existing rows remain valid.
ALTER TABLE public.household_taxonomy
  DROP CONSTRAINT IF EXISTS household_taxonomy_type_check;
ALTER TABLE public.household_taxonomy
  ADD  CONSTRAINT household_taxonomy_type_check
       CHECK (type IN ('category', 'location', 'recipe_tag'));

ALTER TABLE public.household_taxonomy
  DROP CONSTRAINT IF EXISTS household_taxonomy_kind_check;
ALTER TABLE public.household_taxonomy
  ADD  CONSTRAINT household_taxonomy_kind_check
       CHECK (kind IN ('food', 'supplies', 'recipe'));

-- ── Cook history ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recipe_cooks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Denormalized household_id is REQUIRED, not convenience: Realtime filters
  -- postgres_changes on `household_id=eq.<id>` and evaluates RLS against the
  -- WAL replica image (migration 025). Without the column on the row itself,
  -- UPDATE/DELETE events for this table would be silently dropped.
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  recipe_id    uuid NOT NULL REFERENCES public.household_recipes(id) ON DELETE CASCADE,
  cooked_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  servings     numeric CHECK (servings IS NULL OR (servings > 0 AND servings <= 200)),
  -- Audit trail of what was actually deducted, so Undo can restore exactly
  -- and no pantry write is unexplained after the fact:
  --   [{ pantry_item_id, name, amount, unit, prev_quantity }]
  deducted     jsonb NOT NULL DEFAULT '[]'::jsonb
                 CHECK (jsonb_typeof(deducted) = 'array'),
  cooked_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipe_cooks_recipe_idx
  ON public.recipe_cooks (recipe_id, cooked_at DESC);
CREATE INDEX IF NOT EXISTS recipe_cooks_household_idx
  ON public.recipe_cooks (household_id, cooked_at DESC);

-- ── Per-person ratings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recipe_ratings (
  recipe_id    uuid NOT NULL REFERENCES public.household_recipes(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipe_id, user_id)   -- one per person per recipe; upsert target
);

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.recipe_cooks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recipe_cooks_member_access" ON public.recipe_cooks;
CREATE POLICY "recipe_cooks_member_access" ON public.recipe_cooks
  FOR ALL TO authenticated
  USING      (household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()))
  WITH CHECK (household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));

-- Ratings use SPLIT policies rather than FOR ALL: everyone in the household
-- must SEE both people's ratings, but nobody may WRITE (or DELETE) someone
-- else's. A single FOR ALL policy would let a member delete their partner's.
DROP POLICY IF EXISTS "recipe_ratings_member_access" ON public.recipe_ratings;
DROP POLICY IF EXISTS "recipe_ratings_select" ON public.recipe_ratings;
DROP POLICY IF EXISTS "recipe_ratings_insert" ON public.recipe_ratings;
DROP POLICY IF EXISTS "recipe_ratings_update" ON public.recipe_ratings;
DROP POLICY IF EXISTS "recipe_ratings_delete" ON public.recipe_ratings;

CREATE POLICY "recipe_ratings_select" ON public.recipe_ratings
  FOR SELECT TO authenticated
  USING (household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));

CREATE POLICY "recipe_ratings_insert" ON public.recipe_ratings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
    AND household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid()));

CREATE POLICY "recipe_ratings_update" ON public.recipe_ratings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "recipe_ratings_delete" ON public.recipe_ratings
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Cook-stat sync ────────────────────────────────────────────────────
-- NOTE: this UPDATE fires household_recipes' existing updated_at trigger, and
-- the library sorts by updated_at DESC — so cooking a recipe floats it to the
-- top. That is intentional (recency-of-use is a good default order).
CREATE OR REPLACE FUNCTION public.sync_recipe_cook_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_recipe uuid := COALESCE(NEW.recipe_id, OLD.recipe_id);
BEGIN
  UPDATE household_recipes r
     SET cook_count     = (SELECT count(*)       FROM recipe_cooks c WHERE c.recipe_id = v_recipe),
         last_cooked_at = (SELECT max(cooked_at) FROM recipe_cooks c WHERE c.recipe_id = v_recipe)
   WHERE r.id = v_recipe;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS recipe_cooks_sync_stats ON public.recipe_cooks;
CREATE TRIGGER recipe_cooks_sync_stats
  AFTER INSERT OR DELETE OR UPDATE OF cooked_at ON public.recipe_cooks
  FOR EACH ROW EXECUTE FUNCTION public.sync_recipe_cook_stats();

DROP TRIGGER IF EXISTS recipe_ratings_set_updated_at ON public.recipe_ratings;
CREATE TRIGGER recipe_ratings_set_updated_at
  BEFORE UPDATE ON public.recipe_ratings
  FOR EACH ROW EXECUTE FUNCTION public.touch_household_recipe_updated_at(); -- reuses 021's fn

-- ── Realtime ──────────────────────────────────────────────────────────
-- REPLICA IDENTITY FULL so Realtime can evaluate RLS on UPDATE/DELETE
-- payloads (see migration 025 for why this matters).
ALTER TABLE public.recipe_cooks   REPLICA IDENTITY FULL;
ALTER TABLE public.recipe_ratings REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.recipe_cooks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recipe_ratings;
