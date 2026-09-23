-- 015: Pro billing — subscription columns + plan event log

-- Normalise any existing 'annual' plans to 'per_event' before changing constraint
UPDATE organisers SET plan = 'per_event' WHERE plan = 'annual';

-- Swap plan check to use 'pro' instead of 'annual'
ALTER TABLE organisers
  DROP CONSTRAINT IF EXISTS organisers_plan_check;
ALTER TABLE organisers
  ADD CONSTRAINT organisers_plan_check
    CHECK (plan IN ('trial', 'per_event', 'pro'));

-- Subscription tracking columns
ALTER TABLE organisers
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT
    CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'incomplete')),
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_organisers_stripe_sub
  ON organisers(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Plan event log (audit trail for billing transitions)
CREATE TABLE IF NOT EXISTS plan_events (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organiser_id           UUID NOT NULL REFERENCES organisers(id),
  event_type             TEXT NOT NULL
                         CHECK (event_type IN ('upgrade', 'downgrade', 'cancel', 'renew', 'lapse')),
  old_plan               TEXT NOT NULL,
  new_plan               TEXT NOT NULL,
  stripe_subscription_id TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_events_org ON plan_events(organiser_id);
ALTER TABLE plan_events ENABLE ROW LEVEL SECURITY;
