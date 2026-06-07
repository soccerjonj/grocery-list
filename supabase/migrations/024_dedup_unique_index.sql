-- 024_dedup_unique_index.sql
--
-- Structural backstop so duplicate items can't exist even under a race or
-- across devices/tabs (P2 of the add-flows critique). Two devices adding
-- "milk" at the same instant both miss each other's row in the pre-insert
-- SELECT and both INSERT — this index makes the second INSERT fail, and the
-- add hooks catch that failure and turn it into a quantity increment.
--
-- normalize_item_name() is deliberately CONSERVATIVE — lowercase, trim,
-- collapse internal whitespace only. It is intentionally simpler than the
-- client's normalizeItemName (which also folds plurals/accents) so the hard
-- DB constraint can NEVER wrongly unify two genuinely different items. The
-- richer client matching still drives the proactive merge UX; this is just
-- the floor.

CREATE OR REPLACE FUNCTION public.normalize_item_name(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(btrim(coalesce(p, ''))), '\s+', ' ', 'g')
$$;

-- ── pantry_items ───────────────────────────────────────────────────────
ALTER TABLE public.pantry_items
  ADD COLUMN IF NOT EXISTS normalized_name text
  GENERATED ALWAYS AS (public.normalize_item_name(name)) STORED;

-- Collapse any existing duplicates into the OLDEST row (sum quantities) so
-- the unique index below can be created. Irreversible but loss-free for the
-- combined quantity; the oldest row's metadata is the survivor.
UPDATE public.pantry_items p
   SET quantity = agg.total
  FROM (
    SELECT household_id, normalized_name, sum(quantity) AS total
      FROM public.pantry_items
     WHERE normalized_name <> ''
     GROUP BY household_id, normalized_name
    HAVING count(*) > 1
  ) agg,
  LATERAL (
    SELECT id
      FROM public.pantry_items k
     WHERE k.household_id = agg.household_id
       AND k.normalized_name = agg.normalized_name
     ORDER BY k.created_at, k.id
     LIMIT 1
  ) keeper
 WHERE p.id = keeper.id;

DELETE FROM public.pantry_items p
 USING (
   SELECT id,
          row_number() OVER (PARTITION BY household_id, normalized_name
                             ORDER BY created_at, id) AS rn
     FROM public.pantry_items
    WHERE normalized_name <> ''
 ) r
 WHERE p.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS pantry_items_household_norm_uniq
  ON public.pantry_items (household_id, normalized_name)
  WHERE normalized_name <> '';

-- ── shopping_items (only ACTIVE rows are constrained) ──────────────────
ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS normalized_name text
  GENERATED ALWAYS AS (public.normalize_item_name(name)) STORED;

-- Collapse duplicate ACTIVE rows within a list. completed/cleared history is
-- untouched (those are excluded from the partial index below).
UPDATE public.shopping_items s
   SET quantity = agg.total
  FROM (
    SELECT list_id, normalized_name, nullif(sum(coalesce(quantity, 0)), 0) AS total
      FROM public.shopping_items
     WHERE completed = false AND cleared_at IS NULL AND normalized_name <> ''
     GROUP BY list_id, normalized_name
    HAVING count(*) > 1
  ) agg,
  LATERAL (
    SELECT id
      FROM public.shopping_items k
     WHERE k.list_id IS NOT DISTINCT FROM agg.list_id
       AND k.normalized_name = agg.normalized_name
       AND k.completed = false AND k.cleared_at IS NULL
     ORDER BY k.created_at, k.id
     LIMIT 1
  ) keeper
 WHERE s.id = keeper.id;

DELETE FROM public.shopping_items s
 USING (
   SELECT id,
          row_number() OVER (PARTITION BY list_id, normalized_name
                             ORDER BY created_at, id) AS rn
     FROM public.shopping_items
    WHERE completed = false AND cleared_at IS NULL AND normalized_name <> ''
 ) r
 WHERE s.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS shopping_items_list_norm_active_uniq
  ON public.shopping_items (list_id, normalized_name)
  WHERE completed = false AND cleared_at IS NULL AND normalized_name <> '';
