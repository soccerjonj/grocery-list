-- ============================================================
-- Fix: allow household members to see each other
-- ============================================================
-- The previous fix used "users see only their own row" to avoid
-- infinite recursion (policy on household_members querying itself).
-- Solution: a SECURITY DEFINER function that bypasses RLS for the
-- membership check, breaking the cycle safely.

-- 1. Helper function (runs as superuser, no RLS)
CREATE OR REPLACE FUNCTION public.is_household_member(hh_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = hh_id AND user_id = auth.uid()
  );
$$;

-- 2. Replace the restrictive household_members select policy
DROP POLICY IF EXISTS "members_select_own"        ON public.household_members;
DROP POLICY IF EXISTS "members_select_same_household" ON public.household_members;

CREATE POLICY "members_select_same_household" ON public.household_members
  FOR SELECT USING (public.is_household_member(household_id));

-- 3. Allow reading profiles of people in the same household
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

CREATE POLICY "profiles_select_household" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.household_members hm1
      JOIN public.household_members hm2 ON hm1.household_id = hm2.household_id
      WHERE hm1.user_id = auth.uid()
        AND hm2.user_id = profiles.id
    )
  );
