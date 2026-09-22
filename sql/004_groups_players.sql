-- 004: Groups and players

create table groups (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id) on delete cascade,
  group_number     integer not null,
  tee_time         time,
  starting_hole    integer not null default 1
                   check (starting_hole between 1 and 18),
  scorer_player_id uuid  -- set when a player nominates; FK added after players table
);

create index idx_groups_event on groups(event_id);

create table players (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references events(id) on delete cascade,
  first_name        text not null,
  last_name         text not null,
  display_name      text not null,
  email             text,
  handicap_index    numeric,
  playing_handicap  integer,
  group_id          uuid references groups(id),
  pair_key          text,     -- e.g. 'A' or 'B' within a group for pairs formats
  player_token      text not null unique,
  created_at        timestamptz not null default now()
);

create index idx_players_event on players(event_id);
create index idx_players_group on players(group_id);
create index idx_players_token on players(player_token);

-- Now add the FK from groups.scorer_player_id -> players
alter table groups
  add constraint fk_groups_scorer
  foreign key (scorer_player_id) references players(id);
