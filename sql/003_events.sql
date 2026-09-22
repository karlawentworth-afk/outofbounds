-- 003: Events
-- Each event belongs to one organiser, uses one course and one tee.

create table events (
  id                uuid primary key default gen_random_uuid(),
  organiser_id      uuid not null references organisers(id),
  slug              text not null,
  name              text not null,
  event_date        date,
  course_id         uuid references courses(id),
  tee_id            uuid references course_tees(id),
  format            text not null default 'individual_stableford'
                    check (format in (
                      'individual_stableford',
                      'better_ball_2from4',
                      'better_ball_pairs'
                    )),
  handicap_allowance numeric not null default 0.95,
  max_handicap      integer not null default 54,
  starting_mode     text not null default 'tee_times'
                    check (starting_mode in ('tee_times', 'shotgun')),
  leaderboard_freeze_hole integer not null default 12,
  board_rows_per_page     integer not null default 15,
  board_show_full   boolean not null default false,
  sponsor_name      text,
  sponsor_logo_url  text,
  headline_text     text,
  -- Secondary format: derived from same scores, shown as extra board page
  secondary_format  text check (secondary_format in (
                      'individual_stableford',
                      'better_ball_2from4',
                      'better_ball_pairs'
                    )),
  secondary_title   text,
  secondary_allowance numeric,
  status            text not null default 'draft'
                    check (status in ('draft', 'live', 'finished')),
  locked_at         timestamptz,
  created_at        timestamptz not null default now(),
  unique (organiser_id, slug)
);

create index idx_events_organiser on events(organiser_id);
create index idx_events_status on events(status);
