-- Migration 007: atomic turn sequence + migration tracking.

-- 1) Atomic per-event sequence. The app used to do read-modify-write
--    (`game.turn_no + 1` in JS), which can collide and overwrite an event.
--    This does it in one statement, inside the DB.
create or replace function next_turn(p_game_id uuid)
returns int as $$
  update games
     set turn_no = turn_no + 1
   where id = p_game_id
  returning turn_no;
$$ language sql volatile;

-- 2) Migration tracking, so /api/health can name what hasn't been applied
--    instead of guessing from schema drift.
create table if not exists schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

insert into schema_migrations (version) values
  ('001_initial'),
  ('002_money_and_avatar'),
  ('003_pursuits'),
  ('004_profiles'),
  ('005_heng'),
  ('006_errors'),
  ('007_atomic_turn_and_tracking')
on conflict (version) do nothing;
