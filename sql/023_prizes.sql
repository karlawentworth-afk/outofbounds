-- 023: Prizes per event
-- Categories: positional (auto-filled from leaderboard) or manual (pick a player)

CREATE TABLE IF NOT EXISTS prizes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  prize_text  TEXT,
  prize_type  TEXT NOT NULL DEFAULT 'positional'
              CHECK (prize_type IN ('positional', 'manual')),
  player_id   UUID REFERENCES players(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prizes_event ON prizes(event_id, sort_order);
ALTER TABLE prizes ENABLE ROW LEVEL SECURITY;
