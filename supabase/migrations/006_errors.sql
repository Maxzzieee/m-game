-- Migration 006: error log. Nothing in this app used to report when it broke —
-- failures were swallowed by bare catch blocks. Now every failure lands here so
-- /api/health can surface it.

create table if not exists app_errors (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  scope       text not null,          -- 'api/turn', 'agent/worldsim', ...
  message     text not null,
  stack       text,
  context     jsonb not null default '{}'::jsonb,  -- game_id, profile, mode...
  resolved    boolean not null default false
);
create index if not exists app_errors_recent_idx on app_errors(created_at desc);
