-- When a user ignores a "running low" notification, dismissed = true.
-- It resets to false the next time running_low is set to true (bought & restocked).
ALTER TABLE pantry_items
  ADD COLUMN IF NOT EXISTS running_low_dismissed boolean NOT NULL DEFAULT false;
