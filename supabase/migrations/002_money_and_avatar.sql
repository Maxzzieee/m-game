-- Migration 002: in-game money + avatar items.
-- Run this in the Supabase SQL editor (schema.sql for fresh installs already
-- includes these columns after this migration lands).

alter table games add column if not exists money int not null default 20;
alter table games add column if not exists items text[] not null default '{}';
