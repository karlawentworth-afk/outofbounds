-- 011: Scorecard photo source tracking, verification, course versioning

-- Extend courses for photo-sourced cards
alter table courses
  add column photo_url text,
  add column verified_by uuid,       -- organiser_user or organiser id who confirmed
  add column verified_at timestamptz;

-- Course version history (keeps old card when "update existing" is used)
create table course_versions (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses(id) on delete cascade,
  snapshot    jsonb not null,          -- full tees + holes at time of change
  reason      text,                    -- 'photo_update', 'manual_edit', etc
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);

create index idx_course_versions_course on course_versions(course_id);
alter table course_versions enable row level security;
