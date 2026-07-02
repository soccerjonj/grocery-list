-- ============================================================
-- GroceryList — Full Reset & Rebuild
-- Safe to run multiple times. Drops everything and recreates it.
-- Run this in Supabase SQL Editor.
-- ============================================================

-- ─── Drop tables (CASCADE removes dependent policies, indexes, FKs) ──

DROP TABLE IF EXISTS public.shopping_items   CASCADE;
DROP TABLE IF EXISTS public.pantry_items     CASCADE;
DROP TABLE IF EXISTS public.household_members CASCADE;
DROP TABLE IF EXISTS public.households       CASCADE;
DROP TABLE IF EXISTS public.profiles         CASCADE;

-- ─── Drop trigger & function ──────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ─── Tables ───────────────────────────────────────────────────

CREATE TABLE public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.households (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  invite_code text UNIQUE NOT NULL DEFAULT lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.household_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id)
);

CREATE TABLE public.pantry_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name         text NOT NULL,
  quantity     numeric NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit         text,
  notes        text,
  added_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.shopping_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name         text NOT NULL,
  quantity     numeric CHECK (quantity > 0),
  unit         text,
  completed    boolean NOT NULL DEFAULT false,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  cleared_at   timestamptz,
  added_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────

CREATE INDEX pantry_items_household_idx   ON public.pantry_items (household_id);
CREATE INDEX shopping_items_household_idx ON public.shopping_items (household_id);
CREATE INDEX shopping_items_cleared_idx   ON public.shopping_items (household_id, cleared_at);

-- ─── Trigger: auto-create profile on sign-up ─────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ─── Enable RLS ───────────────────────────────────────────────

ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pantry_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_items    ENABLE ROW LEVEL SECURITY;

-- ─── Policies: profiles ───────────────────────────────────────

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- ─── Policies: households ─────────────────────────────────────
-- SELECT: any authenticated user — needed so non-members can look
--   up a household by invite code before joining, and so the
--   insert+select timing issue is avoided on creation.
-- INSERT: any authenticated user

CREATE POLICY "households_select" ON public.households
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "households_insert" ON public.households
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "households_update" ON public.households
  FOR UPDATE USING (created_by = auth.uid());

-- ─── Policies: household_members ─────────────────────────────
-- IMPORTANT: do NOT reference household_members from within its own
-- policy — that causes infinite recursion. Each user sees only their
-- own membership rows; that is all the app needs.

CREATE POLICY "members_select_own" ON public.household_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "members_insert_self" ON public.household_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "members_delete_self" ON public.household_members
  FOR DELETE USING (user_id = auth.uid());

-- ─── Policies: pantry_items ───────────────────────────────────

CREATE POLICY "pantry_all" ON public.pantry_items
  FOR ALL USING (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid()
    )
  );

-- ─── Policies: shopping_items ─────────────────────────────────

CREATE POLICY "shopping_all" ON public.shopping_items
  FOR ALL USING (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid()
    )
  );

-- ─── Realtime ─────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.pantry_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;

-- REPLICA IDENTITY FULL so Realtime can run RLS on UPDATE/DELETE events and
-- actually deliver check-offs/edits/deletes (see migration 025).
ALTER TABLE public.pantry_items   REPLICA IDENTITY FULL;
ALTER TABLE public.shopping_items REPLICA IDENTITY FULL;

-- ─── Back-fill profile for any existing auth users ────────────
-- Handles accounts created before the trigger existed.

INSERT INTO public.profiles (id, display_name)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'display_name', split_part(email, '@', 1))
FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════
-- Mirror of migration 026 (account + household management RPCs)
-- ══════════════════════════════════════════════════════════════════
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
