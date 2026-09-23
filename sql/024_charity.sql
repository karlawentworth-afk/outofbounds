-- 024: Charity block per event

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS charity_name TEXT,
  ADD COLUMN IF NOT EXISTS charity_line TEXT,
  ADD COLUMN IF NOT EXISTS charity_url TEXT,
  ADD COLUMN IF NOT EXISTS charity_logo_url TEXT;
