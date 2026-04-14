-- ============================================================
-- GroceryList — Initial Schema
-- Run this in your Supabase SQL editor or via Supabase CLI
-- ============================================================

-- ─── Tables ───────────────────────────────────────────────────
-- All tables are created first so foreign key references and
-- policy expressions can resolve correctly.

CREATE TABLE public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.households (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  invite_code text UNIQUE NOT NULL DEFAULT lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.household_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id)
);

CREATE TABLE public.pantry_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name         text NOT NULL,
  quantity     numeric NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit         text,
  notes        text,
  added_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.shopping_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name         text NOT NULL,
  quantity     numeric CHECK (quantity > 0),
  unit         text,
  completed    boolean NOT NULL DEFAULT false,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  cleared_at   timestamptz,
  added_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────

CREATE INDEX pantry_items_household_idx   ON public.pantry_items (household_id);
CREATE INDEX shopping_items_household_idx ON public.shopping_items (household_id);
CREATE INDEX shopping_items_cleared_idx   ON public.shopping_items (household_id, cleared_at);

-- ─── Trigger: auto-create profile on sign-up ─────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ─── Enable RLS on all tables ─────────────────────────────────

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pantry_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_items   ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ─────────────────────────────────────────────
-- All tables exist now, so cross-table references in policies are safe.

-- profiles
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- households: readable by members, insertable by any authed user
CREATE POLICY "households_select_member" ON public.households
  FOR SELECT USING (
    id IN (
      SELECT household_id FROM public.household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "households_insert_auth" ON public.households
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "households_update_owner" ON public.households
  FOR UPDATE USING (created_by = auth.uid());

-- household_members: each user can only see their own rows.
-- Querying household_members from within its own policy causes
-- infinite recursion, so we keep this simple.
CREATE POLICY "members_select_own" ON public.household_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "members_insert_self" ON public.household_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "members_delete_self" ON public.household_members
  FOR DELETE USING (user_id = auth.uid());

-- pantry_items
CREATE POLICY "pantry_member_access" ON public.pantry_items
  FOR ALL USING (
    household_id IN (
      SELECT household_id FROM public.household_members WHERE user_id = auth.uid()
    )
  );

-- shopping_items
CREATE POLICY "shopping_member_access" ON public.shopping_items
  FOR ALL USING (
    household_id IN (
      SELECT household_id FROM public.household_members WHERE user_id = auth.uid()
    )
  );

-- ─── Realtime ─────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.pantry_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;
