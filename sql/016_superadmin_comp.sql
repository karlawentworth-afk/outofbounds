-- 016: Superadmin flag, comp billing, plan_source

ALTER TABLE organisers
  ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS plan_source TEXT NOT NULL DEFAULT 'stripe'
    CHECK (plan_source IN ('stripe', 'comp')),
  ADD COLUMN IF NOT EXISTS comp_until TIMESTAMPTZ;
