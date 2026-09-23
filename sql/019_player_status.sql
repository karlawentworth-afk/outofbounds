-- 019: Player status (invited → confirmed) and handicap_source

-- Replace invited/self_registered booleans with a status column
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS player_status TEXT NOT NULL DEFAULT 'invited'
    CHECK (player_status IN ('invited', 'confirmed'));

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS handicap_source TEXT DEFAULT 'organiser'
    CHECK (handicap_source IN ('organiser', 'player'));

-- Drop old booleans (keep for now as they may be referenced; set defaults)
-- ALTER TABLE players DROP COLUMN IF EXISTS invited;
-- ALTER TABLE players DROP COLUMN IF EXISTS self_registered;
