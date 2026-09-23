-- 016: Superadmin flag, comp billing, plan_source

ALTER TABLE organisers
  ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS plan_source TEXT NOT NULL DEFAULT 'stripe'
    CHECK (plan_source IN ('stripe', 'comp')),
  ADD COLUMN IF NOT EXISTS comp_until TIMESTAMPTZ;

-- Set superadmin for Karla's organiser
UPDATE organisers
SET is_superadmin = TRUE
WHERE id = '623ceed4-1803-4f79-8b8e-0bb77502a497';

-- Verify
SELECT id, name, slug, plan, is_superadmin, plan_source, comp_until
FROM organisers
WHERE is_superadmin = TRUE;
