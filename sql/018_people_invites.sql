-- 018: People directory, send log, invite infrastructure

CREATE TABLE IF NOT EXISTS people (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organiser_id      UUID NOT NULL REFERENCES organisers(id) ON DELETE CASCADE,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  email             TEXT,
  handicap_index    NUMERIC(4,1),
  source            TEXT NOT NULL DEFAULT 'typed'
                    CHECK (source IN ('typed', 'invite', 'upload')),
  remove_token      TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  last_event_at     TIMESTAMPTZ,
  events_count      INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  cleanup_warned_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_people_org_email
  ON people(organiser_id, lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_people_org
  ON people(organiser_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_people_remove
  ON people(remove_token)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS send_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organiser_id  UUID NOT NULL REFERENCES organisers(id),
  person_id     UUID NOT NULL REFERENCES people(id),
  event_id      UUID NOT NULL REFERENCES events(id),
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'sent', 'delivered', 'bounced', 'failed')),
  resend_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_send_log_event ON send_log(event_id, status);
CREATE INDEX IF NOT EXISTS idx_send_log_org ON send_log(organiser_id);
CREATE INDEX IF NOT EXISTS idx_send_log_resend ON send_log(resend_id) WHERE resend_id IS NOT NULL;

ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE send_log ENABLE ROW LEVEL SECURITY;
