-- Migration 004: two-player household profiles.
-- Each passcode maps to a profile; every save belongs to one profile.
-- Existing saves default to 'main' (the original player).

alter table games add column if not exists profile text not null default 'main';
create index if not exists games_profile_idx on games(profile, updated_at desc);
