-- 006: Sponsor slides for the board rotation

create table event_slides (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  image_url     text not null,
  headline      text,
  message       text,
  seconds       integer not null default 8,
  display_order integer not null default 0,
  active        boolean not null default true
);

create index idx_event_slides_event on event_slides(event_id);
