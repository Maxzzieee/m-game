# Infrastructure & Tech-Debt Audit

_Scope: 41 source files, ~6,700 lines. Findings are evidence-based (probed the running
app and the live DB), not speculative._

## Verdict

The app is **structurally sound**. Security, auth, and data isolation all pass. The real
weakness was never the game logic — it was **blindness**: failures were swallowed by bare
`catch {}` blocks, nothing was tested, and nothing ran on push. You found bugs by playing
and noticing. That's now fixed at the system level.

---

## ✅ Verified healthy (probed, not assumed)

| Area | Evidence |
|---|---|
| Auth on every route | 9/9 API routes return 401 unauthenticated |
| Session integrity | Forged + tampered cookies rejected (HMAC, timing-safe compare) |
| Profile isolation | `main`'s save invisible to `p2`; all queries profile-scoped |
| Input handling | Malformed/garbage bodies → 400, never 500 |
| Dice fairness | 10k rolls: every face 350–650; adv/dis measured at 75%/25% (theory: 75/25) |
| Stat budgets | All 5 presets + LLM-derived custom archetypes sum to exactly +4 |
| Secrets | API keys server-side only; `.env.local` gitignored; never in a client bundle |
| Data integrity | 77-event save: perfect player/dm alternation, zero duplicates |

## 🐛 Bugs found & fixed in this audit

1. **Karma never drained (silent, long-running).** `maybeKarmaCashIn` wrote the bleed to
   the DB but left the in-memory `game.karma` stale; `applyDelta` then recomputed from the
   stale value and **reverted the bleed**. Karma stayed ≥5 forever, so cash-ins re-fired at
   30%/turn indefinitely. → in-memory copy now synced.
2. **Summariser hiccup faked a DM failure.** `maybeSummarize` was unguarded, so a Haiku
   rate-limit threw *after* the scene was saved — you'd see "the DM stumbled" on a turn
   that actually succeeded. → post-scene bookkeeping is now best-effort + logged.
3. **Forever-spinning d20** (shipped `be69896`). `/api/roll` returning an error left the
   overlay churning with `dice=undefined`. → double-fire gate, explicit error path, 8s escape.
4. **Stale choice options.** A legacy regex prose-scraper could resurface old options when
   the DM emitted none. → deleted; choices come solely from structured tool output.

## 🧯 Systems built (the "report & fix issues" ask)

- **`app_errors` table + `lib/log.ts`** — every failure is captured with scope, stack, and
  context (game, profile, mode). Nothing fails silently now.
- **`GET /api/health`** — one gated URL: env present? DB reachable? schema drifted
  (missing migration)? what broke recently? Check this first when something's wrong.
- **CI (`.github/workflows/ci.yml`)** — typecheck + tests + build on every push. Also gives
  a visible signal when a push lands (the "why isn't Vercel deploying?" problem).
- **Test suite (18 tests, `npm test`)** — dice fairness/modifiers/nat-rules, manual-dice
  clamping, stat budgets, tier coverage, calendar across 2016–2033, sanitizer strictness.
  `npm run check` = typecheck + test + build.

## ⚠️ Known debt (accepted, not yet fixed)

| Item | Risk | Note |
|---|---|---|
| **No DB backups** | **High** | The save wipe was unrecoverable. Supabase PITR is paid; a nightly `pg_dump` or an in-app "export life to JSON" would cover it. |
| Manual migrations | Medium | 6 SQL files run by hand, no `schema_migrations` table. `/api/health` now detects drift, but applying is still manual. |
| Read-modify-write races | Low | `setMeta` and `recordEvent` (`turn_no + 1`) aren't atomic. Harmless single-player (turns are sequential); would need a Postgres RPC if ever concurrent. |
| No rate limiting | Low | Anyone with the passcode can burn API budget. Fine for 2 trusted players. |
| Dead plumbing | Low | `dm_model_pref` / `MODELS.dmBig` / `useBig` kept deliberately as a one-line revive path for the removed BIG BEAT. `parseChoices` now test-only. |
| Local transcript ids | Low | Optimistic append uses `local-*` ids until the next full fetch. Cosmetic. |
| 60s function limit | Low | A very long Opus turn could clip. Sonnet-only makes this unlikely. |

## 🔮 If something breaks, do this

1. `GET /api/health` (logged in) → env, DB, schema drift, recent errors.
2. Failing turn? The error is now in `app_errors` with the game id and mode.
3. Ran a migration? Re-check `/api/health` — it selects the newest columns.
4. Locally: `npm run check` before pushing.
