-- 005: Hole scores and score edit log

create table hole_scores (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references events(id) on delete cascade,
  player_id             uuid not null references players(id) on delete cascade,
  hole_number           integer not null check (hole_number between 1 and 18),
  gross_score           integer,
  picked_up             boolean not null default false,
  recorded_by_player_id uuid references players(id),
  updated_at            timestamptz not null default now(),
  unique (event_id, player_id, hole_number)
);

create index idx_hole_scores_event on hole_scores(event_id);
create index idx_hole_scores_player on hole_scores(player_id);

create table score_edits (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,
  player_id       uuid not null references players(id),
  hole_number     integer not null,
  old_gross       integer,
  new_gross       integer,
  old_picked_up   boolean,
  new_picked_up   boolean,
  edited_by       uuid not null,   -- organiser_user id or player id
  reason          text,
  edited_at       timestamptz not null default now()
);

create index idx_score_edits_event on score_edits(event_id);
