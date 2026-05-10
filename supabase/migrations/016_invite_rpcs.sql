-- 016_invite_rpcs.sql
-- Invite-flow RPCs that let the sign-up + email-confirmation path carry an
-- invite code through and auto-join the user — eliminating the "lose the
-- invite at the auth boundary" problem.
--
-- Both functions are SECURITY DEFINER so they run with elevated privileges.
-- This is safe because:
--   • Each is keyed by invite_code, which is itself a secret bearer token.
--   • lookup_invite returns only minimal info (household name, taken hex
--     colors) — nothing PII.
--   • join_household_with_code uses auth.uid() to identify the caller, so
--     it can't be tricked into joining someone else.

-- ─── lookup_invite ──────────────────────────────────────────────────────
-- Anonymous-readable. Powers the "Joining {Household}" banner on the signup
-- page and lets the color picker exclude colors already taken by existing
-- members so the user picks once instead of twice.
CREATE OR REPLACE FUNCTION public.lookup_invite(p_code text)
RETURNS TABLE (
  household_id uuid,
  household_name text,
  taken_colors text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hh_id uuid;
  hh_name text;
BEGIN
  SELECT id, name
    INTO hh_id, hh_name
    FROM households
   WHERE invite_code = lower(trim(p_code));

  IF hh_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT hh_id,
         hh_name,
         COALESCE(
           ARRAY(
             SELECT p.color
               FROM household_members hm
               JOIN profiles p ON p.id = hm.user_id
              WHERE hm.household_id = hh_id
                AND p.color IS NOT NULL
           ),
           ARRAY[]::text[]
         );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_invite(text) TO anon, authenticated;

-- ─── join_household_with_code ───────────────────────────────────────────
-- Called by signed-in users (typically right after email confirmation) to
-- atomically add themselves to the household identified by the invite code.
-- Idempotent: if already a member, just returns the household_id.
CREATE OR REPLACE FUNCTION public.join_household_with_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hh_id uuid;
  uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO hh_id
    FROM households
   WHERE invite_code = lower(trim(p_code));

  IF hh_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  INSERT INTO household_members (household_id, user_id, role)
  VALUES (hh_id, uid, 'member')
  ON CONFLICT (household_id, user_id) DO NOTHING;

  RETURN hh_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_household_with_code(text) TO authenticated;
