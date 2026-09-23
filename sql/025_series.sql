-- 025: Series — named collection of events with order of merit

CREATE TABLE IF NOT EXISTS series (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organiser_id    UUID NOT NULL REFERENCES organisers(id),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  best_of         INTEGER NOT NULL DEFAULT 5,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_series_org_slug ON series(organiser_id, slug);
CREATE INDEX IF NOT EXISTS idx_series_org ON series(organiser_id);

-- Link events to series
ALTER TABLE events ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES series(id);
CREATE INDEX IF NOT EXISTS idx_events_series ON events(series_id) WHERE series_id IS NOT NULL;

ALTER TABLE series ENABLE ROW LEVEL SECURITY;
