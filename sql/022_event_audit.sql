-- 022: Event audit log for day-of changes

CREATE TABLE IF NOT EXISTS event_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  detail      JSONB,
  edited_by   UUID NOT NULL,
  edited_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_audit_event ON event_audit(event_id, edited_at DESC);
ALTER TABLE event_audit ENABLE ROW LEVEL SECURITY;
