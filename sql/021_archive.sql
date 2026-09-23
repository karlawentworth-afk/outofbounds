-- 021: Archive flag for finished events
ALTER TABLE events ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
