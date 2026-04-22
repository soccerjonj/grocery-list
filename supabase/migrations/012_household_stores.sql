CREATE TABLE IF NOT EXISTS household_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(household_id, name)
);
ALTER TABLE household_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores_household_access" ON household_stores
  FOR ALL USING (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );
