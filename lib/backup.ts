import { db } from "./supabase";
import type { Game } from "./types";

// Whole-life backup. The save wipe earlier was unrecoverable — this makes a
// life a file you own. Export dumps every row belonging to a save; import
// rebuilds it under the calling profile with fresh ids.

export const BACKUP_VERSION = 1;

export interface LifeBackup {
  version: number;
  exported_at: string;
  game: Record<string, unknown>;
  npcs: Record<string, unknown>[];
  events: Record<string, unknown>[];
  seeds: Record<string, unknown>[];
  arc_journal: Record<string, unknown>[];
  pursuits: Record<string, unknown>[];
}

export async function exportLife(game: Game): Promise<LifeBackup> {
  const q = async (table: string) => {
    const { data } = await db().from(table).select("*").eq("game_id", game.id);
    return (data as Record<string, unknown>[]) ?? [];
  };
  const [npcs, events, seeds, arc_journal, pursuits] = await Promise.all([
    q("npcs"),
    q("events"),
    q("seeds"),
    q("arc_journal"),
    q("pursuits"),
  ]);
  return {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    game: game as unknown as Record<string, unknown>,
    npcs,
    events,
    seeds,
    arc_journal,
    pursuits,
  };
}

// Strip identity/ownership columns so the row can be re-inserted cleanly.
function scrub(row: Record<string, unknown>, drop: string[]): Record<string, unknown> {
  const out = { ...row };
  for (const k of drop) delete out[k];
  return out;
}

export async function importLife(backup: LifeBackup, profile: string): Promise<string> {
  if (!backup || typeof backup !== "object") throw new Error("not a backup file");
  if (backup.version !== BACKUP_VERSION) {
    throw new Error(`unsupported backup version ${backup.version} (expected ${BACKUP_VERSION})`);
  }
  if (!backup.game || typeof backup.game !== "object") throw new Error("backup has no game");

  // Recreate the save under THIS profile with a fresh id (never trust the file's
  // id or profile — that's how you'd import into someone else's life).
  const gameRow = scrub(backup.game, ["id", "created_at", "updated_at", "profile"]);
  gameRow.profile = profile;

  const { data: created, error } = await db().from("games").insert(gameRow).select("id").single();
  if (error || !created) throw new Error(`import failed: ${error?.message}`);
  const gameId = created.id as string;

  const child = async (table: string, rows: Record<string, unknown>[]) => {
    if (!rows?.length) return;
    const scrubbed = rows.map((r) => ({
      ...scrub(r, ["id", "game_id", "created_at", "updated_at"]),
      game_id: gameId,
    }));
    // chunk to stay well under statement limits on long lives
    for (let i = 0; i < scrubbed.length; i += 500) {
      const { error: e } = await db().from(table).insert(scrubbed.slice(i, i + 500));
      if (e) throw new Error(`import ${table} failed: ${e.message}`);
    }
  };

  await child("npcs", backup.npcs);
  await child("events", backup.events);
  await child("seeds", backup.seeds);
  await child("arc_journal", backup.arc_journal);
  await child("pursuits", backup.pursuits);

  return gameId;
}
