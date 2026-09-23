-- 020: Counted holes for partial-round finish, auto-close flag

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS counted_holes INTEGER DEFAULT 18,
  ADD COLUMN IF NOT EXISTS auto_closed BOOLEAN NOT NULL DEFAULT FALSE;
