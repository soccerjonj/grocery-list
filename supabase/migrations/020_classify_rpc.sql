-- 020_classify_rpc.sql
--
-- Companion to migration 019. The /api/classify-item server route uses
-- this RPC to populate the global item_classifications cache without
-- needing a separate service_role key on Vercel.
--
-- Idempotent: if a row already exists for this name (concurrent
-- classification race), the existing row wins and the insert is a no-op.

CREATE OR REPLACE FUNCTION public.cache_item_classification(
  p_name             text,
  p_kind             text,
  p_food_category    text,
  p_storage_location text,
  p_fridge_zone      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_kind NOT IN ('food', 'supplies') THEN
    RAISE EXCEPTION 'kind must be food or supplies, got %', p_kind;
  END IF;
  INSERT INTO item_classifications (name, kind, food_category, storage_location, fridge_zone, source)
  VALUES (lower(trim(p_name)), p_kind, p_food_category, p_storage_location, p_fridge_zone, 'llm')
  ON CONFLICT (name) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cache_item_classification(text, text, text, text, text) TO authenticated;
