-- 017_unique_active_shopping_list.sql
--
-- Fixes the "shopping list disappears mid-trip" data-loss bug.
--
-- Root cause: useShoppingFlow.init runs a SELECT then INSERT-if-missing.
-- If the SELECT returns null because of a network error (instead of truly
-- no active list), the INSERT branch ran and created a SECOND non-archived
-- list. The app then preferred the newest one — leaving all the household's
-- items orphaned on the older list and the apps showing empty.
--
-- Three pieces here, in order:
--   1. Data cleanup: resolve any households that already have duplicates.
--      Empty duplicates are simply deleted (no data loss). For the rare case
--      of two non-empty duplicates, keep the oldest (which contains the
--      user's accumulated items) and archive the rest.
--   2. Partial unique index: makes duplicates physically impossible going
--      forward, at the DB level.
--   3. get_or_create_active_shopping_list RPC: replaces the racy
--      SELECT-then-INSERT pattern with an atomic, race-safe primitive.

-- ─── 1. Cleanup: delete empty duplicates ────────────────────────────────
-- For each household with multiple non-archived lists, drop any that have
-- ZERO items. These are the empty rows created by the buggy init() path.
DELETE FROM shopping_lists sl
WHERE sl.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM shopping_items si WHERE si.list_id = sl.id
  )
  AND EXISTS (
    SELECT 1 FROM shopping_lists sl2
    WHERE sl2.household_id = sl.household_id
      AND sl2.id <> sl.id
      AND sl2.archived_at IS NULL
  );

-- ─── 1b. Cleanup: archive remaining non-empty duplicates ────────────────
-- For any household that STILL has multiple non-archived lists (rare —
-- both lists have items), keep the OLDEST one (the user's primary list)
-- and archive the rest. Items are preserved either way.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY household_id
           ORDER BY created_at ASC
         ) AS rn
  FROM shopping_lists
  WHERE archived_at IS NULL
)
UPDATE shopping_lists
SET archived_at = NOW(),
    name = COALESCE(NULLIF(name, ''), 'list') || ' (resolved)'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ─── 2. Partial unique index ────────────────────────────────────────────
-- Enforces: at most one non-archived shopping list per household.
-- Postgres respects this for INSERT ... ON CONFLICT and surfaces a
-- unique_violation (SQLSTATE 23505) for plain inserts so the application
-- can recover gracefully.
CREATE UNIQUE INDEX IF NOT EXISTS shopping_lists_one_active_per_household_idx
  ON shopping_lists (household_id)
  WHERE archived_at IS NULL;

-- ─── 3. Atomic get-or-create RPC ────────────────────────────────────────
-- Replaces the client-side SELECT+INSERT in useShoppingFlow.init. If two
-- callers race, one INSERT succeeds and the other catches unique_violation
-- and re-SELECTs the winner. Caller always gets a valid list_id.
--
-- SECURITY INVOKER so RLS applies (callers must already have insert
-- permission on shopping_lists, which existing app code requires).
CREATE OR REPLACE FUNCTION public.get_or_create_active_shopping_list(p_household_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_list_id uuid;
BEGIN
  -- Common case: an active list already exists.
  SELECT id INTO v_list_id
    FROM shopping_lists
   WHERE household_id = p_household_id
     AND archived_at IS NULL
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_list_id IS NOT NULL THEN
    RETURN v_list_id;
  END IF;

  -- No active list — try to create one. If a concurrent caller wins the
  -- race, our INSERT raises unique_violation and we adopt theirs.
  BEGIN
    INSERT INTO shopping_lists (household_id, name, created_by)
    VALUES (p_household_id, 'current', auth.uid())
    RETURNING id INTO v_list_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_list_id
      FROM shopping_lists
     WHERE household_id = p_household_id
       AND archived_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1;
  END;

  RETURN v_list_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_active_shopping_list(uuid) TO authenticated;
