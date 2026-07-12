-- ============================================================================
-- Singapore Life Sim — Postgres schema (Supabase)
--
-- This is the AUTHORITATIVE game state. The LLM never "remembers" any of these
-- numbers — the server reads them from here and re-injects them into the prompt
-- every turn. That is what defeats context fatigue.
--
-- Run this in the Supabase SQL editor (or `psql`) once to provision the DB.
-- Single-player / private: no Row Level Security, no Supabase Auth. Access is
-- gated at the app layer by a passcode. All DB access is server-side via the
-- service-role key.
-- ============================================================================

-- Enable UUIDs
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- games: one row per save slot. Holds the whole deterministic ledger as columns
-- + a couple of JSONB blobs for the flexible bits.
-- ----------------------------------------------------------------------------
create table if not exists games (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- identity
  char_name         text not null,
  stereotype        text not null,           -- Mugger | Athlete | Joker | Pai Kia | Average Joe
  ses_roll          int  not null,           -- 1..100
  ses_tier          text not null,           -- human-readable tier label
  looks_roll        int  not null,           -- 1..100
  looks_tier        text not null,

  -- progression
  arc               int  not null default 1, -- 1..5
  arc_name          text not null default 'The Orientation',
  age               int  not null default 13,
  ingame_date       text not null default '2016-01',  -- YYYY-MM, cosmetic

  -- four core stats (range -1..+5)
  brains            int  not null default 1,
  face              int  not null default 1,
  brawn             int  not null default 1,
  guts              int  not null default 1,

  -- five reputation axes (range -5..+5)
  rep_academic      int  not null default 0,
  rep_social        int  not null default 0,
  rep_street        int  not null default 0,
  rep_family        int  not null default 0,
  rep_system        int  not null default 0,

  -- economy
  money             int  not null default 20,        -- pocket money, SGD; can go negative (debt)
  items             text[] not null default '{}',    -- owned shop items (avatar gear)

  -- mental / meta
  mental_state      text not null default 'Fresh',   -- Fresh|Tired|Stress|Burnt Out|On Fire
  on_fire_checks    int  not null default 0,          -- remaining [On Fire] checks
  karma             int  not null default 0,          -- HIDDEN counter
  confirm_chop      boolean not null default true,    -- available this arc?

  -- model preference for this save
  dm_model_pref     text not null default 'standard', -- standard | big

  -- turn counter (monotonic)
  turn_no           int  not null default 0,

  -- flexible extras
  meta              jsonb not null default '{}'::jsonb
);

-- ----------------------------------------------------------------------------
-- npcs: the recurring cast + anyone the world sim spawns. Relationship meters
-- and hidden motivations are tracked here, never in the model's memory.
-- ----------------------------------------------------------------------------
create table if not exists npcs (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid not null references games(id) on delete cascade,
  created_at        timestamptz not null default now(),

  name              text not null,
  archetype         text not null,           -- ride_or_die | rival | mentor | wildcard | love_interest | minor
  hook              text not null,           -- 1-line personality hook
  hidden_motivation text,                     -- revealed to player over time (kept out of prose until earned)
  relationship      int  not null default 0, -- silent meter, roughly -5..+5
  status            text not null default 'active',  -- active | left | estranged | dead
  tags              text[] not null default '{}',    -- e.g. {sec_school, cca_band}
  first_arc         int  not null default 1,
  meta              jsonb not null default '{}'::jsonb
);
create index if not exists npcs_game_idx on npcs(game_id);

-- ----------------------------------------------------------------------------
-- events: append-only scene log. Every DM turn writes one row. This powers both
-- retrieval (the "reputation echo" engine) and the summariser.
-- `tags` is the retrieval key — NPC ids, locations, themes present in the scene.
-- ----------------------------------------------------------------------------
create table if not exists events (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid not null references games(id) on delete cascade,
  created_at        timestamptz not null default now(),

  turn_no           int  not null,
  arc               int  not null,
  role              text not null default 'dm',   -- dm | player
  prose             text not null,                -- the narration or the player's action text
  summary           text,                         -- one-line summary the DM emits (for cheap retrieval display)
  dice              jsonb,                         -- {stat, dc, d20, total, outcome} if a roll happened
  tags              text[] not null default '{}', -- retrieval key
  summarized        boolean not null default false -- has this been folded into the arc journal yet?
);
create index if not exists events_game_idx on events(game_id, turn_no);
create index if not exists events_tags_idx on events using gin(tags);

-- ----------------------------------------------------------------------------
-- seeds: Butterfly-Effect seeds. Decisions that WILL pay off later.
-- ----------------------------------------------------------------------------
create table if not exists seeds (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid not null references games(id) on delete cascade,
  created_at        timestamptz not null default now(),

  description       text not null,
  arc_created       int  not null,
  resolved_at_turn  int,                     -- null while pending
  tags              text[] not null default '{}',
  meta              jsonb not null default '{}'::jsonb
);
create index if not exists seeds_game_idx on seeds(game_id);

-- ----------------------------------------------------------------------------
-- arc_journal: rolling compressed summary. One row per (game, arc). The
-- summariser folds old verbatim turns into `body` so the prompt stays small.
-- ----------------------------------------------------------------------------
create table if not exists arc_journal (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid not null references games(id) on delete cascade,
  arc               int  not null,
  body              text not null default '',        -- running summary of this arc
  last_turn_folded  int  not null default 0,          -- highest turn_no folded into body
  canon             text,                              -- terse "canon facts" once arc closes
  updated_at        timestamptz not null default now(),
  unique(game_id, arc)
);
create index if not exists arc_journal_game_idx on arc_journal(game_id);

-- ----------------------------------------------------------------------------
-- pursuits: the Dreams engine. A declared life dream tracked on a 0-6 milestone
-- ladder (SPARK .. THE SUMMIT). One active pursuit at a time (soft rule).
-- ----------------------------------------------------------------------------
create table if not exists pursuits (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid not null references games(id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  dream             text not null,
  stage             int  not null default 0,          -- 0 SPARK .. 6 THE SUMMIT
  status            text not null default 'active',   -- active | achieved | transformed | abandoned
  next_milestone    text,
  note              text,
  meta              jsonb not null default '{}'::jsonb
);
create index if not exists pursuits_game_idx on pursuits(game_id);

-- ----------------------------------------------------------------------------
-- keep updated_at fresh
-- ----------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists games_touch on games;
create trigger games_touch before update on games
  for each row execute function touch_updated_at();

drop trigger if exists pursuits_touch on pursuits;
create trigger pursuits_touch before update on pursuits
  for each row execute function touch_updated_at();
