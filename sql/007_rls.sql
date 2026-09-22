-- 007: Row Level Security
-- All access goes through Netlify functions using the service key,
-- so RLS is a defence-in-depth belt. The anon key is never exposed.
-- Deny everything to anon; service key bypasses RLS automatically.

alter table organisers enable row level security;
alter table organiser_users enable row level security;
alter table courses enable row level security;
alter table course_tees enable row level security;
alter table course_holes enable row level security;
alter table events enable row level security;
alter table groups enable row level security;
alter table players enable row level security;
alter table hole_scores enable row level security;
alter table score_edits enable row level security;
alter table event_slides enable row level security;

-- No policies = anon gets nothing. Service role bypasses RLS.
