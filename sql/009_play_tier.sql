-- 009: Play tier — accounts, payments, results, player invites

-- Link organisers to Supabase Auth users
alter table organisers
  add column auth_user_id uuid unique,
  add column onboard_type text,  -- 'friends_societies', 'charity_days', 'club_competitions', 'events_company'
  add column stripe_customer_id text;

create index idx_organisers_auth on organisers(auth_user_id) where auth_user_id is not null;

-- Events: payment tracking
alter table events
  add column paid boolean not null default false,
  add column stripe_checkout_id text,
  add column stripe_payment_intent text,
  add column paid_at timestamptz,
  add column paid_amount_pence integer,
  add column player_count_at_payment integer,
  add column results_published boolean not null default false,
  add column results_published_at timestamptz;

-- Players: self-registration via invite link
alter table players
  add column invited boolean not null default false,
  add column self_registered boolean not null default false,
  add column invite_token text unique;

create index idx_players_invite on players(invite_token) where invite_token is not null;

-- Courses: shared library with verification
alter table courses
  add column verified boolean not null default false,
  add column contributed_by uuid references organisers(id);

-- Player invite link tracking
create table event_invites (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  invite_code text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz
);

create index idx_event_invites_code on event_invites(invite_code);

-- Payment log (belt and braces alongside Stripe)
create table payments (
  id                    uuid primary key default gen_random_uuid(),
  organiser_id          uuid not null references organisers(id),
  event_id              uuid not null references events(id),
  stripe_checkout_id    text not null,
  stripe_payment_intent text,
  amount_pence          integer not null,
  currency              text not null default 'gbp',
  player_count          integer not null,
  status                text not null default 'pending'
                        check (status in ('pending', 'paid', 'refunded')),
  created_at            timestamptz not null default now(),
  paid_at               timestamptz
);

create index idx_payments_event on payments(event_id);

alter table event_invites enable row level security;
alter table payments enable row level security;
