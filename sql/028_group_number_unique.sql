-- 028: Fix duplicate group numbers and add unique constraint.
--
-- Step 1: Renumber any duplicates within each event to be sequential.
-- Step 2: Add a unique constraint on (event_id, group_number).

-- Renumber: for each event, assign group_number = row_number
WITH numbered AS (
  SELECT id, event_id,
    ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY group_number, id) AS new_num
  FROM groups
)
UPDATE groups
SET group_number = numbered.new_num
FROM numbered
WHERE groups.id = numbered.id
  AND groups.group_number != numbered.new_num;

-- Now safe to add the unique constraint
ALTER TABLE groups
  ADD CONSTRAINT groups_event_number_unique UNIQUE (event_id, group_number);
