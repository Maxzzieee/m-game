-- Migration 009: per-game MODE — 'story' (the dice/adversity RPG) or
-- 'sandbox' (the Wishgranter consequence engine: no dice, wishes granted in
-- full, each mirrored by a true cost). Lets two players on the same install
-- run fundamentally different games side by side. Run in the SQL editor.

alter table games add column if not exists mode text not null default 'story';

insert into schema_migrations (version) values ('009_mode')
on conflict (version) do nothing;
