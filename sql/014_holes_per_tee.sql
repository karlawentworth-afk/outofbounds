-- 014: course_holes keyed on course_tees.id, not courses.id
-- Par and SI differ by rating_gender on the same tee colour.

-- Add tee_id column to course_holes
alter table course_holes add column tee_id uuid references course_tees(id) on delete cascade;

-- Drop the old unique constraint (course_id, hole_number)
alter table course_holes drop constraint if exists course_holes_course_id_hole_number_key;

-- New unique: one par/SI per (tee, hole)
alter table course_holes add constraint course_holes_tee_hole_unique
  unique (tee_id, hole_number);

-- Index for lookups
create index idx_course_holes_tee on course_holes(tee_id);

-- course_id stays for backward compat but tee_id is the primary key going forward
