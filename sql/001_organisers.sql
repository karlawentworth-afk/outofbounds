-- 001: Organisers and organiser users
-- Run first. Everything hangs off organiser_id.

create table organisers (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  logo_url    text,
  primary_colour text default '#1B2A4A',
  accent_colour  text default '#2E7D32',
  text_on_primary text default '#FFFFFF',
  contact_email  text,
  plan        text not null default 'trial'
              check (plan in ('trial', 'per_event', 'annual')),
  created_at  timestamptz not null default now(),
  active      boolean not null default true
);

create table organiser_users (
  id            uuid primary key default gen_random_uuid(),
  organiser_id  uuid not null references organisers(id),
  email         text not null,
  display_name  text,
  role          text not null default 'organiser'
                check (role in ('owner', 'organiser', 'helper')),
  magic_token   text unique,
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  revoked_at    timestamptz,
  unique (organiser_id, email)
);

create index idx_organiser_users_email on organiser_users(email);
create index idx_organiser_users_token on organiser_users(magic_token) where magic_token is not null;
