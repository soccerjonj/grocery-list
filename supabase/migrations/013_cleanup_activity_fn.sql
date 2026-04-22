CREATE OR REPLACE FUNCTION cleanup_stale_activity(p_household_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
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
$$;

GRANT EXECUTE ON FUNCTION cleanup_stale_activity(uuid) TO authenticated;
