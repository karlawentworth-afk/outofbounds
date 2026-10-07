-- 026: Add tester flag and activity tracking for pilot customers

-- Tester flag on organisers
ALTER TABLE organisers ADD COLUMN IF NOT EXISTS is_tester BOOLEAN DEFAULT FALSE;

-- Activity tracking
ALTER TABLE organisers ADD COLUMN IF NOT EXISTS last_sign_in TIMESTAMPTZ;

-- Activity log for superadmin monitoring
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organiser_id UUID NOT NULL REFERENCES organisers(id),
  action TEXT NOT NULL,  -- 'sign_in', 'event_created', 'player_added', 'score_saved', 'error'
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_org ON activity_log(organiser_id, created_at DESC);
