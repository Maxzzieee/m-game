-- Migration 003: the Dreams engine.
-- Run in the Supabase SQL editor. (schema.sql includes this for fresh installs.)

create table if not exists pursuits (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid not null references games(id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  dream             text not null,                    -- "professional footballer"
  stage             int  not null default 0,          -- 0 SPARK .. 6 THE SUMMIT
  status            text not null default 'active',   -- active | achieved | transformed | abandoned
  next_milestone    text,                             -- what stage+1 looks like, DM-written
  note              text,                             -- latest development, DM-written
  meta              jsonb not null default '{}'::jsonb
);
create index if not exists pursuits_game_idx on pursuits(game_id);

drop trigger if exists pursuits_touch on pursuits;
create trigger pursuits_touch before update on pursuits
  for each row execute function touch_updated_at();
