-- 025_realtime_replica_identity.sql
--
-- Fix: realtime check-offs / edits / deletes don't reach the other member's
-- phone (only pull-to-refresh shows them); adding an item DOES propagate.
--
-- Cause: Supabase Realtime applies RLS before delivering a postgres_changes
-- event. For UPDATE/DELETE it evaluates the policy against the row's WAL
-- replica image. With the DEFAULT replica identity that image is only the
-- primary key, so the household-membership policy
--   household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
-- can't be evaluated (household_id isn't present) and Realtime silently drops
-- the event. INSERT carries the full new row, so adds work — hence the
-- confusing "adds sync but check-offs don't" behaviour.
--
-- REPLICA IDENTITY FULL puts the entire old row into the WAL so Realtime can
-- run RLS and deliver UPDATE/DELETE events. WAL overhead is negligible at
-- household scale.

ALTER TABLE public.shopping_items    REPLICA IDENTITY FULL;
ALTER TABLE public.pantry_items      REPLICA IDENTITY FULL;
ALTER TABLE public.shopping_lists    REPLICA IDENTITY FULL;
ALTER TABLE public.activity_log      REPLICA IDENTITY FULL;
ALTER TABLE public.household_recipes REPLICA IDENTITY FULL;
