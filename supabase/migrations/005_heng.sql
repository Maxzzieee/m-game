-- Migration 005: HENG tokens — the scarce reroll resource.
-- Spend one to reroll a d20 before the consequence is narrated; second roll
-- stands. Start with 2, +1 at each arc transition, cap 3.

alter table games add column if not exists heng int not null default 2;
