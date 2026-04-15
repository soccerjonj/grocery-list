-- ============================================================
-- Fix: households SELECT policy was too restrictive
-- ============================================================
-- The old policy only let users read households they were already
-- a member of. This broke two flows:
--
--   1. Create: Supabase's .insert().select() does INSERT then
--      SELECT — but the user isn't in household_members yet at
--      that instant, so the SELECT was denied. (Fixed in code by
--      generating the UUID client-side and dropping .select().)
--
--   2. Join: looking up a household by invite code requires a
--      SELECT before the user is a member. No code workaround
--      exists for this — the policy must allow it.
--
-- New policy: any authenticated user can read any household.
-- Household names are not sensitive enough to warrant locking
-- down reads this tightly in a small household app.
-- ============================================================

DROP POLICY IF EXISTS "households_select"        ON public.households;
DROP POLICY IF EXISTS "households_select_member"  ON public.households;

CREATE POLICY "households_select" ON public.households
  FOR SELECT USING (auth.uid() IS NOT NULL);
