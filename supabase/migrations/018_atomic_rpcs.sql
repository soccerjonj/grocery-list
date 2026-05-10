-- 018_atomic_rpcs.sql
--
-- Closes two atomicity holes that could cause data corruption under
-- partial-failure conditions (network blip, RLS hiccup mid-write):
--
--   1. finish_shopping_trip: previously the archive-list + create-new-list +
--      move-unchecked-items sequence was three separate round-trips. If
--      step 3 partially failed, some items ended up split across two lists
--      (one of them archived/invisible) — the same shape as the bug that
--      orphaned a couple's grocery list mid-trip.
--
--   2. create_household_with_owner: previously the households INSERT and
--      household_members INSERT were two separate round-trips. If the
--      second failed, an orphaned household existed forever — invisible
--      via RLS and undeletable by the user.

-- ─── finish_shopping_trip ──────────────────────────────────────────────
-- Atomically:
--   • archives the given active list (sets archived_at + display name),
--   • get-or-creates the next active list (race-safe, reuses migration 017),
--   • moves all uncompleted, non-cleared items from the archived list
--     onto the new list with their completion state reset.
--
-- Returns the new active list's id so the caller can update local state
-- without an extra fetch.
CREATE OR REPLACE FUNCTION public.finish_shopping_trip(
  p_list_id uuid,
  p_trip_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
  v_new_list_id uuid;
  v_now timestamptz := now();
BEGIN
  -- Verify the list exists and is active. RLS limits visibility to
  -- household members so this also implicitly checks authorization.
  SELECT household_id INTO v_household_id
    FROM shopping_lists
   WHERE id = p_list_id
     AND archived_at IS NULL;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Active shopping list not found or already archived';
  END IF;

  -- 1. Archive the current list with the trip name
  UPDATE shopping_lists
     SET archived_at = v_now,
         name = COALESCE(NULLIF(trim(p_trip_name), ''), name)
   WHERE id = p_list_id;

  -- 2. Get-or-create the next active list (race-safe; if another caller
  --    just created one we adopt theirs instead of failing)
  v_new_list_id := get_or_create_active_shopping_list(v_household_id);

  -- 3. Move all unchecked, non-cleared items to the new list, resetting
  --    their completion state
  UPDATE shopping_items
     SET list_id = v_new_list_id,
         completed = false,
         completed_by = NULL,
         completed_at = NULL
   WHERE list_id = p_list_id
     AND completed = false
     AND cleared_at IS NULL;

  RETURN v_new_list_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finish_shopping_trip(uuid, text) TO authenticated;

-- ─── create_household_with_owner ───────────────────────────────────────
-- Atomically creates a new household and adds the caller as its owner.
-- SECURITY DEFINER so we don't depend on the households-INSERT RLS policy
-- being permissive enough for first-time household creation; we enforce
-- caller identity via auth.uid().
CREATE OR REPLACE FUNCTION public.create_household_with_owner(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_uid uuid := auth.uid();
  v_trimmed text := trim(coalesce(p_name, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_trimmed = '' THEN
    RAISE EXCEPTION 'Household name required';
  END IF;

  -- Ensure a profile row exists (in case the auth-user trigger never ran)
  INSERT INTO profiles (id, display_name)
  VALUES (v_uid, '')
  ON CONFLICT (id) DO NOTHING;

  -- Create the household + membership in a single transaction. If either
  -- fails, the whole thing rolls back (no orphaned household).
  INSERT INTO households (name, created_by)
  VALUES (v_trimmed, v_uid)
  RETURNING id INTO v_id;

  INSERT INTO household_members (household_id, user_id, role)
  VALUES (v_id, v_uid, 'owner');

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_household_with_owner(text) TO authenticated;
