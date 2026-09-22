-- 013: Tees carry no gender. Rating is what's gendered.
-- One course_tees row per (tee colour, rating_gender).

-- Replace tee_set with rating_gender
alter table course_tees drop column if exists tee_set;
alter table course_tees add column rating_gender text
  check (rating_gender in ('men', 'women'))
  default 'men';

-- Players: which tee and which rating gender
alter table players
  add column tee_id uuid references course_tees(id),
  add column rating_gender text check (rating_gender in ('men', 'women'));

-- Events: defaults for all players
alter table events
  add column default_tee_id uuid references course_tees(id),
  add column default_rating_gender text check (default_rating_gender in ('men', 'women'));
