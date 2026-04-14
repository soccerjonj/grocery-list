-- ============================================================
-- Fix: infinite recursion in household_members SELECT policy
-- ============================================================
-- The original policy checked membership by querying
-- household_members from within a household_members policy,
-- causing infinite recursion. Replace it with a simple
-- "users can only see their own membership rows" policy.
-- The other tables (households, pantry_items, shopping_items)
-- still reference household_members in their policies — that's
-- fine because those are on *different* tables, not self-referential.

DROP POLICY IF EXISTS "members_select_same_household" ON public.household_members;

CREATE POLICY "members_select_own" ON public.household_members
  FOR SELECT USING (user_id = auth.uid());
