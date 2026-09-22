-- 010: Course library — GolfCourseAPI integration, rate limits, reports

-- Extend courses with source tracking
alter table courses
  add column course_name text,
  add column city text,
  add column country text,
  add column latitude numeric,
  add column longitude numeric,
  add column scorecard_url text,
  add column source text,          -- 'golfcourseapi' | 'manual' | null
  add column source_id text,       -- external API id
  add column imported_at timestamptz;

-- Rename existing 'name' to 'club_name' for clarity (non-breaking: old queries still work via alias)
-- Actually, keep 'name' as-is and use club_name as the new column if needed.
-- Better: just use 'club' (already exists) for the club name and 'name' for the course name.
-- The existing schema has: name (course name) and club (club name). That works.

-- Add source tracking index
create index idx_courses_source on courses(source, source_id) where source is not null;

-- Extend course_tees with gender grouping and source metadata
alter table course_tees
  add column tee_set text check (tee_set in ('female', 'male')),
  add column total_yards integer,
  add column number_of_holes integer default 18;

-- API call rate tracking
create table api_calls (
  id          uuid primary key default gen_random_uuid(),
  api_name    text not null,              -- 'golfcourseapi'
  endpoint    text not null,              -- '/v1/search' or '/v1/courses/{id}'
  called_at   timestamptz not null default now(),
  response_ok boolean not null default true
);

create index idx_api_calls_date on api_calls(api_name, called_at);

-- Course reports from players
create table course_reports (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses(id),
  event_id    uuid references events(id),
  player_id   uuid references players(id),
  report_text text not null,
  created_at  timestamptz not null default now()
);

create index idx_course_reports_course on course_reports(course_id);

alter table api_calls enable row level security;
alter table course_reports enable row level security;
