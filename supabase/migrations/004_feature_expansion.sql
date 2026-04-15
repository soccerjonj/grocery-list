-- ============================================================
-- GroceryList — Feature Expansion
-- Named shopping lists, store field, pantry categories,
-- expiration dates, and item ownership.
-- Safe to run on an existing DB (uses IF NOT EXISTS / IF EXISTS).
-- ============================================================

-- ── shopping_lists ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shopping_lists (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name         text NOT NULL,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz
);

CREATE INDEX IF NOT EXISTS shopping_lists_household_idx ON public.shopping_lists (household_id);

ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shopping_lists_all" ON public.shopping_lists;
CREATE POLICY "shopping_lists_all" ON public.shopping_lists
  FOR ALL USING (
    household_id IN (
      SELECT household_id FROM public.household_members WHERE user_id = auth.uid()
    )
  );

-- ── shopping_items: list_id + store ──────────────────────────────

ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS list_id uuid REFERENCES public.shopping_lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS store   text;

CREATE INDEX IF NOT EXISTS shopping_items_list_idx ON public.shopping_items (list_id);

-- ── pantry_items: expiry, storage location, food category, owners ─

ALTER TABLE public.pantry_items
  ADD COLUMN IF NOT EXISTS expires_at        date,
  ADD COLUMN IF NOT EXISTS storage_location  text,
  ADD COLUMN IF NOT EXISTS fridge_zone       text,
  ADD COLUMN IF NOT EXISTS food_category     text,
  ADD COLUMN IF NOT EXISTS assigned_to       uuid[];

-- storage_location values: 'fridge' | 'freezer' | 'pantry' | 'room_temp'
-- fridge_zone values:      'quick_use' | 'long_term'  (only when storage_location = 'fridge')
-- food_category values:    'produce' | 'meat' | 'dairy' | 'drinks' |
--                          'condiments' | 'grains' | 'snacks' | 'prepared' | 'other'
-- assigned_to:             NULL = whole household, [uuid] = one person,
--                          [uuid, uuid] = two specific people, etc.

-- ── Realtime ─────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_lists;
