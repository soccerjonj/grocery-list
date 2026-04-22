CREATE TABLE IF NOT EXISTS activity_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  action       text        NOT NULL,  -- e.g. 'pantry_add'
  item_name    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_household_access" ON activity_log
  FOR ALL USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- Expose to Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
