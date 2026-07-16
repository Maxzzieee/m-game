// Minimal in-process rate limiter. Guards the Anthropic budget against a stuck
// client retry-looping (or a passcode leak). Per-serverless-instance rather
// than global — that's fine here: the goal is catching runaway loops, not
// adversarial abuse from two trusted players.

const buckets = new Map<string, number[]>();

export interface Limit {
  windowMs: number;
  max: number;
}

export const TURN_LIMIT: Limit = { windowMs: 60_000, max: 12 }; // ~1 turn/5s sustained

// Returns null if allowed, or seconds-to-wait if the caller should back off.
export function rateLimit(key: string, limit: Limit = TURN_LIMIT): number | null {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < limit.windowMs);
  if (hits.length >= limit.max) {
    const retryMs = limit.windowMs - (now - hits[0]);
    buckets.set(key, hits);
    return Math.max(1, Math.ceil(retryMs / 1000));
  }
  hits.push(now);
  buckets.set(key, hits);

  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size > 50) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= limit.windowMs)) buckets.delete(k);
    }
  }
  return null;
}
