-- 012: Scorecard reads — async background processing

create table scorecard_reads (
  id            uuid primary key default gen_random_uuid(),
  organiser_id  uuid not null references organisers(id),
  course_id     uuid references courses(id),  -- null if new course
  photo_path    text not null,                 -- Supabase storage path
  status        text not null default 'pending'
                check (status in ('pending', 'processing', 'done', 'failed')),
  result        jsonb,                         -- the parsed card JSON
  warnings      jsonb,                         -- validation warnings
  error_message text,                          -- plain English reason on failure
  duration_ms   integer,                       -- how long Claude took
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index idx_scorecard_reads_status on scorecard_reads(organiser_id, status);
alter table scorecard_reads enable row level security;

-- Storage bucket (run this in Supabase Storage settings, not SQL):
-- Create bucket 'scorecards', public: false
