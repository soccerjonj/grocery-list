-- 022_security_hardening.sql
--
-- Closes the findings from the full-codebase security review.
--
--   CRITICAL — multi-tenant takeover. The `household_members` INSERT policy
--   only checked `user_id = auth.uid()` (no invite proof), and the
--   `households` SELECT policy let every authenticated user read every
--   household row INCLUDING its secret invite_code. Together: any logged-in
--   user could enumerate all households and insert a self-membership row
--   (even role='owner') for any of them, gaining full CRUD on another
--   tenant's data in two requests. Fix: joining is now possible ONLY through
--   the invite-validating SECURITY DEFINER RPCs (join_household_with_code /
--   create_household_with_owner), and households are readable by members only.
--
--   HIGH — cleanup_stale_activity ran SECURITY DEFINER with no membership
--   check, so any user could delete another household's activity_log by
--   passing its id. Now guarded by is_household_member().
--
--   HIGH — no rate limiting anywhere. Adds a Postgres-backed token bucket
--   (check_rate_limit RPC) the LLM API routes call to throttle abuse of the
--   paid Anthropic key.
--
--   LOW — item_classifications was readable by the anon role; restricted to
--   authenticated.

-- ─── 1. Lock down household_members INSERT (CRITICAL) ───────────────────
-- The only legitimate ways to gain membership are:
--   • create_household_with_owner (018) — SECURITY DEFINER, inserts owner row
--   • join_household_with_code (016)    — SECURITY DEFINER, validates invite
-- Both run as the function owner and bypass RLS, so revoking the direct
-- client INSERT does not break them. Drop the permissive policy AND revoke
-- the table grant (defense in depth).
DROP POLICY IF EXISTS "members_insert_self" ON public.household_members;
REVOKE INSERT ON public.household_members FROM authenticated, anon;

-- ─── 2. Restrict households SELECT to members only (CRITICAL/HIGH) ──────
-- Reverses migration 003's `USING (auth.uid() IS NOT NULL)`, which exposed
-- every household's invite_code + created_by to all users. Pre-join lookups
-- (name, taken colors) are served by the SECURITY DEFINER lookup_invite RPC,
-- which returns only non-sensitive fields — so non-members never need direct
-- SELECT. The insert-then-select creation race that 003 worked around is
-- already solved by create_household_with_owner (018), which returns the id.
DROP POLICY IF EXISTS "households_select"        ON public.households;
DROP POLICY IF EXISTS "households_select_member" ON public.households;

CREATE POLICY "households_select_member" ON public.households
  FOR SELECT
  USING (public.is_household_member(id));

-- ─── 3. Guard cleanup_stale_activity (HIGH) ────────────────────────────
-- Was SECURITY DEFINER, granted to authenticated, filtered only by the
-- caller-supplied p_household_id => cross-tenant deletion. Add an explicit
-- membership check and pin search_path.
CREATE OR REPLACE FUNCTION public.cleanup_stale_activity(p_household_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: the caller must belong to the target household.
  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'not a member of this household';
  END IF;

  -- Delete notifications older than 7 days
  DELETE FROM activity_log
  WHERE household_id = p_household_id
    AND created_at < now() - interval '7 days';

  -- Remove running_low notifications for items no longer marked low
  DELETE FROM activity_log
  WHERE household_id = p_household_id
    AND action = 'pantry_running_low'
    AND item_name NOT IN (
      SELECT name FROM pantry_items
      WHERE household_id = p_household_id AND running_low = true
    );

  -- Remove duplicate running_low entries, keep only the most recent per item
  DELETE FROM activity_log
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY household_id, item_name, action
          ORDER BY created_at DESC
        ) AS rn
      FROM activity_log
      WHERE household_id = p_household_id AND action = 'pantry_running_low'
    ) ranked WHERE rn > 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_stale_activity(uuid) TO authenticated;

-- ─── 4. Rate limiting (HIGH) ───────────────────────────────────────────
-- Postgres-backed token bucket keyed by auth.uid() + a named bucket. The
-- table is touched ONLY by the SECURITY DEFINER function below; clients get
-- no direct grant (RLS enabled, no policies => deny all direct access).
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket       text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  count        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket)
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only the SECURITY DEFINER function may read/write.

-- Returns true if the call is ALLOWED (within limit), false if throttled.
-- Atomically increments the caller's counter for the window; resets the
-- window when it has elapsed. Counts the current call.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cur integer;
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO api_rate_limits (user_id, bucket, window_start, count)
  VALUES (uid, p_bucket, now(), 1)
  ON CONFLICT (user_id, bucket) DO UPDATE
    SET count = CASE
          WHEN api_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          THEN 1
          ELSE api_rate_limits.count + 1
        END,
        window_start = CASE
          WHEN api_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          THEN now()
          ELSE api_rate_limits.window_start
        END
  RETURNING count INTO cur;

  RETURN cur <= p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated;

-- ─── 4b. household_recipes.source_url scheme constraint (MED) ──────────
-- Defense-in-depth against a stored javascript:/data: URI being rendered as
-- a "View source" <a href>. The client also validates at store + render.
ALTER TABLE public.household_recipes
  DROP CONSTRAINT IF EXISTS household_recipes_source_url_http;
ALTER TABLE public.household_recipes
  ADD CONSTRAINT household_recipes_source_url_http
  CHECK (source_url IS NULL OR source_url ~* '^https?://');

-- ─── 5. item_classifications: drop anon read (LOW) ─────────────────────
-- The global product->category cache was readable by the anon role (the
-- anon key ships in the client bundle). Restrict to authenticated.
DROP POLICY IF EXISTS "item_classifications_read" ON public.item_classifications;

CREATE POLICY "item_classifications_read" ON public.item_classifications
  FOR SELECT
  TO authenticated
  USING (true);
