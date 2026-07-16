-- Migration 008: the money system — recurring ledger + goals with stakes.
-- Turns money from an inert balance into a living force: hustle for a reason,
-- earn over time, chase goals under pressure. Run in the Supabase SQL editor.

-- Recurring income & expenses. `monthly` is SIGNED: income positive, expense
-- negative, so the net is a plain sum. Net accrues to games.money as time passes.
create table if not exists money_flows (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references games(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  kind        text not null,          -- job | hustle | business | investment | expense
  name        text not null,
  monthly     int  not null,          -- SGD/month, signed
  status      text not null default 'active',  -- active | ended
  note        text
);
create index if not exists money_flows_game_idx on money_flows(game_id, status);

-- Money goals: the "pull". World pressures (source=world, with a deadline and
-- stakes) and player aspirations (source=self). saved is money earmarked toward
-- the target.
create table if not exists money_goals (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references games(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  label       text not null,
  target      int  not null,
  saved       int  not null default 0,
  deadline    text,                   -- YYYY-MM, nullable
  source      text not null default 'self',    -- world | self
  stakes      text,                   -- what happens if a world goal is missed
  status      text not null default 'active',  -- active | met | failed | abandoned
  note        text
);
create index if not exists money_goals_game_idx on money_goals(game_id, status);

drop trigger if exists money_flows_touch on money_flows;
create trigger money_flows_touch before update on money_flows
  for each row execute function touch_updated_at();
drop trigger if exists money_goals_touch on money_goals;
create trigger money_goals_touch before update on money_goals
  for each row execute function touch_updated_at();

insert into schema_migrations (version) values ('008_money')
on conflict (version) do nothing;
