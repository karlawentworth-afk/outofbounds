-- 017: Branding — secondary colour, dark logo, display name, version history

ALTER TABLE organisers
  ADD COLUMN IF NOT EXISTS secondary_colour TEXT,
  ADD COLUMN IF NOT EXISTS logo_dark_url TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT;

CREATE TABLE IF NOT EXISTS branding_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organiser_id      UUID NOT NULL REFERENCES organisers(id),
  logo_url          TEXT,
  logo_dark_url     TEXT,
  primary_colour    TEXT,
  secondary_colour  TEXT,
  accent_colour     TEXT,
  text_on_primary   TEXT,
  text_on_secondary TEXT,
  display_name      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branding_ver_org
  ON branding_versions(organiser_id, created_at DESC);

ALTER TABLE branding_versions ENABLE ROW LEVEL SECURITY;
