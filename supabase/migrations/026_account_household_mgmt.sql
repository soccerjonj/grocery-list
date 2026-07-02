-- 026_account_household_mgmt.sql
--
-- Settings overhaul: release-ready household + account management.
--
-- Routes every privileged household mutation through owner-checked
-- SECURITY DEFINER RPCs (matching the join_household_with_code pattern) and
-- stops trusting households.created_by for authorization — that breaks the
-- moment ownership is transferred. Direct client UPDATE/DELETE on households
-- and DELETE on household_members are revoked; all such ops now go through
-- the audited RPCs below (continues the migration-022 hardening posture).
--
-- Fixes a live bug: "remove member" in settings issued a direct
-- household_members DELETE that RLS (USING user_id = auth.uid()) silently
-- rejected — 0 rows, no error. remove_household_member() replaces it.

-- ── Helper: is the caller the owner of hh_id? ──────────────────────────
CREATE OR REPLACE FUNCTION public.is_household_owner(hh_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
     WHERE household_id = hh_id
       AND user_id = auth.uid()
       AND role = 'owner'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_household_owner(uuid) TO authenticated;

-- ── Lock down direct client writes; privileged ops go through RPCs ─────
-- created_by-based UPDATE no longer valid once ownership can transfer.
DROP POLICY IF EXISTS "households_update_owner" ON public.households;
REVOKE UPDATE, DELETE ON public.households FROM authenticated, anon;
-- All membership removals go through leave/remove/transfer/delete RPCs so
-- the sole-owner safeguard can't be bypassed by a direct self-DELETE.
DROP POLICY IF EXISTS "members_delete_self" ON public.household_members;
REVOKE DELETE ON public.household_members FROM authenticated, anon;

-- ── rename_household ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rename_household(p_household_id uuid, p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF NOT public.is_household_owner(p_household_id) THEN
    RAISE EXCEPTION 'Only the household owner can rename it';
  END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Household name required'; END IF;
  UPDATE public.households SET name = left(v_name, 60) WHERE id = p_household_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.rename_household(uuid, text) TO authenticated;

-- ── regenerate_invite_code (revoke a leaked invite) ────────────────────
CREATE OR REPLACE FUNCTION public.regenerate_invite_code(p_household_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF NOT public.is_household_owner(p_household_id) THEN
    RAISE EXCEPTION 'Only the household owner can regenerate the invite code';
  END IF;
  LOOP
    v_code := lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    BEGIN
      UPDATE public.households SET invite_code = v_code WHERE id = p_household_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- astronomically unlikely 8-hex collision; loop and retry
    END;
  END LOOP;
  RETURN v_code;
END; $$;
GRANT EXECUTE ON FUNCTION public.regenerate_invite_code(uuid) TO authenticated;

-- ── remove_household_member (owner removes someone else) ───────────────
CREATE OR REPLACE FUNCTION public.remove_household_member(p_household_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_household_owner(p_household_id) THEN
    RAISE EXCEPTION 'Only the household owner can remove members';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Use leave_household to remove yourself';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.household_members
     WHERE household_id = p_household_id AND user_id = p_user_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Cannot remove an owner';
  END IF;
  DELETE FROM public.household_members
   WHERE household_id = p_household_id AND user_id = p_user_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.remove_household_member(uuid, uuid) TO authenticated;

-- ── transfer_household_ownership (hand off; you become a member) ───────
CREATE OR REPLACE FUNCTION public.transfer_household_ownership(p_household_id uuid, p_new_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_household_owner(p_household_id) THEN
    RAISE EXCEPTION 'Only the current owner can transfer ownership';
  END IF;
  IF p_new_owner = auth.uid() THEN
    RAISE EXCEPTION 'You already own this household';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members
     WHERE household_id = p_household_id AND user_id = p_new_owner
  ) THEN
    RAISE EXCEPTION 'That person is not a member of this household';
  END IF;
  UPDATE public.household_members SET role = 'owner'
   WHERE household_id = p_household_id AND user_id = p_new_owner;
  UPDATE public.household_members SET role = 'member'
   WHERE household_id = p_household_id AND user_id = auth.uid();
END; $$;
GRANT EXECUTE ON FUNCTION public.transfer_household_ownership(uuid, uuid) TO authenticated;

-- ── leave_household (sole owner blocked — must transfer or delete) ─────
CREATE OR REPLACE FUNCTION public.leave_household(p_household_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members
     WHERE household_id = p_household_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are not a member of this household';
  END IF;
  IF public.is_household_owner(p_household_id) THEN
    RAISE EXCEPTION 'You are the owner. Transfer ownership or delete the household to leave.';
  END IF;
  DELETE FROM public.household_members
   WHERE household_id = p_household_id AND user_id = auth.uid();
END; $$;
GRANT EXECUTE ON FUNCTION public.leave_household(uuid) TO authenticated;

-- ── delete_household (owner; cascades all household data) ──────────────
CREATE OR REPLACE FUNCTION public.delete_household(p_household_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_household_owner(p_household_id) THEN
    RAISE EXCEPTION 'Only the household owner can delete it';
  END IF;
  -- ON DELETE CASCADE purges members, pantry_items, shopping_items,
  -- shopping_lists, activity_log, household_stores, household_recipes.
  DELETE FROM public.households WHERE id = p_household_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.delete_household(uuid) TO authenticated;

-- ── households_blocking_account_deletion ──────────────────────────────
-- Households where the caller is the (sole) owner AND other members remain.
-- The account-delete flow must have these resolved (transfer or delete)
-- first. Powers both the UI gate and the server-side re-check.
CREATE OR REPLACE FUNCTION public.households_blocking_account_deletion()
RETURNS TABLE(id uuid, name text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT h.id, h.name
    FROM public.households h
    JOIN public.household_members me
      ON me.household_id = h.id AND me.user_id = auth.uid() AND me.role = 'owner'
   WHERE (SELECT count(*) FROM public.household_members m WHERE m.household_id = h.id) > 1;
$$;
GRANT EXECUTE ON FUNCTION public.households_blocking_account_deletion() TO authenticated;
