-- 023_attribution_integrity.sql
--
-- Closes the LOW-severity write-policy finding: the member-scoped FOR ALL
-- policies on pantry_items / shopping_items rely on Postgres reusing USING
-- as the implicit WITH CHECK, which constrains only household_id — NOT the
-- attribution columns. So a member could:
--   • INSERT/UPDATE a row with added_by / completed_by set to ANOTHER user's
--     UUID (spoofed attribution — "X added this" / "X bought this"), or
--   • if they belong to two households, PATCH household_id to move a row
--     from household A into household B.
--
-- The naive fix `WITH CHECK (added_by = auth.uid())` would BREAK legitimate
-- collaboration: when member B edits an item that member A added, the row's
-- added_by is still A, so the check would reject B's edit. Instead we use
-- BEFORE triggers that force the values server-side. This matches what the
-- app already writes, so it is behavior-preserving for the real client and
-- only neutralizes hand-crafted malicious writes.

-- ─── pantry_items ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_pantry_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- The creator is always the authenticated caller, never a spoofed id.
    NEW.added_by := auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    -- Attribution and tenancy are immutable after creation.
    NEW.added_by      := OLD.added_by;
    NEW.household_id  := OLD.household_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pantry_items_attribution ON public.pantry_items;
CREATE TRIGGER pantry_items_attribution
  BEFORE INSERT OR UPDATE ON public.pantry_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pantry_attribution();

-- ─── shopping_items ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_shopping_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.added_by := auth.uid();
    -- completed_by is only meaningful when the row is completed; pin it to
    -- the caller in that case, else null.
    IF NEW.completed THEN
      NEW.completed_by := auth.uid();
    ELSE
      NEW.completed_by := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.added_by     := OLD.added_by;
    NEW.household_id := OLD.household_id;
    -- Whoever flips an item to completed is recorded as the completer; an
    -- item that isn't completed has no completer.
    IF NEW.completed THEN
      IF NOT OLD.completed OR OLD.completed_by IS NULL THEN
        NEW.completed_by := auth.uid();
      ELSE
        NEW.completed_by := OLD.completed_by;
      END IF;
    ELSE
      NEW.completed_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shopping_items_attribution ON public.shopping_items;
CREATE TRIGGER shopping_items_attribution
  BEFORE INSERT OR UPDATE ON public.shopping_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_shopping_attribution();
