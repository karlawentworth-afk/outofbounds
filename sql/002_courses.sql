-- 002: Courses, tees, and holes
-- organiser_id nullable: null = shared library course

create table courses (
  id            uuid primary key default gen_random_uuid(),
  organiser_id  uuid references organisers(id),
  name          text not null,
  club          text,
  created_at    timestamptz not null default now()
);

create index idx_courses_organiser on courses(organiser_id);

create table course_tees (
  id        uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  tee_name  text not null,
  colour    text,
  slope     numeric not null default 113,
  rating    numeric not null,
  par_total integer not null
);

create index idx_course_tees_course on course_tees(course_id);

create table course_holes (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references courses(id) on delete cascade,
  hole_number  integer not null check (hole_number between 1 and 18),
  par          integer not null check (par between 3 and 6),
  stroke_index integer not null check (stroke_index between 1 and 18),
  unique (course_id, hole_number)
);

create index idx_course_holes_course on course_holes(course_id);
