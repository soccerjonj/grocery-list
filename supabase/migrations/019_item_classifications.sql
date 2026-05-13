-- 019_item_classifications.sql
--
-- Global cache for item-name → kind/category/storage classifications
-- produced by the Anthropic Haiku categorizer (T3-D).
--
-- Why global, not per-household:
--   "milk" classifies the same way for every household. Sharing the
--   cache means each unique item is classified at most once across the
--   whole user base, keeping LLM costs negligible (~$0.001/item, once).
--
-- Why "name" as the primary key:
--   Names are normalized (lowercase, trimmed) before INSERT, and
--   they're naturally unique per the application's contract. No need
--   for a synthetic id.
--
-- Reads are public — anyone authenticated can SELECT for the cache hit.
-- Writes are only from the server-side route which uses the SUPABASE
-- service_role (or, on Vercel, the Supabase RLS bypass via service-role
-- env var). The application code never writes here from the client.

CREATE TABLE IF NOT EXISTS public.item_classifications (
  name             text PRIMARY KEY,
  kind             text NOT NULL CHECK (kind IN ('food', 'supplies')),
  food_category    text,
  storage_location text,
  fridge_zone      text,
  source           text NOT NULL DEFAULT 'llm',  -- 'llm', 'seed', etc.
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.item_classifications ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read the cache (no PII; just product → category).
CREATE POLICY "item_classifications_read"
  ON public.item_classifications
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- The cache-write RPC lives in 020_classify_rpc.sql (additive — 019 was
-- applied before the helper was designed).
