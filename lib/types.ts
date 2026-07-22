// Shared domain types. Mirrors supabase/schema.sql.

export type Stereotype = "Mugger" | "Athlete" | "Joker" | "Pai Kia" | "Average Joe";

export type MentalState = "Fresh" | "Tired" | "Stress" | "Burnt Out" | "On Fire";

export type GameMode = "story" | "sandbox";

// Where/when the current scene is set — surfaced to the player as a scene header.
export interface Scene {
  location: string; // "Jalan Besar Stadium", "the void deck", "a rooftop in Seoul"
  time_of_day: string; // "Friday, ~9pm", "just before dawn", "lunch break"
}

// A MOMENT is a bounded, zoomed-in set-piece the player plays out beat-by-beat
// (the match, the audition, the demo day) before the game zooms back out to the
// life/summary layer. Lives in games.meta.moment while active.
export interface Moment {
  title: string; // "The Match", "SM audition, round 2"
  kind: string; // match | audition | build | confrontation | pitch | first-time | scene
  active: boolean;
}

export type StatKey = "brains" | "face" | "brawn" | "guts";
export type RepKey = "rep_academic" | "rep_social" | "rep_street" | "rep_family" | "rep_system";

export interface Game {
  id: string;
  created_at: string;
  updated_at: string;
  profile: string; // 'main' | 'p2' | 'p3' — which household player owns this save

  mode: GameMode; // 'story' = dice/adversity RPG · 'sandbox' = Wishgranter consequence engine

  char_name: string;
  stereotype: string; // preset name or a custom LLM-derived label ("The Quiet Artist")
  ses_roll: number;
  ses_tier: string;
  looks_roll: number;
  looks_tier: string;

  arc: number;
  arc_name: string;
  age: number;
  ingame_date: string;

  brains: number;
  face: number;
  brawn: number;
  guts: number;

  rep_academic: number;
  rep_social: number;
  rep_street: number;
  rep_family: number;
  rep_system: number;

  money: number;
  items: string[];

  mental_state: MentalState;
  on_fire_checks: number;
  karma: number;
  confirm_chop: boolean;
  heng: number; // reroll tokens (+1 per arc, cap 3)

  turn_no: number;
  meta: Record<string, unknown>;
}

export interface Npc {
  id: string;
  game_id: string;
  created_at: string;
  name: string;
  archetype: string;
  hook: string;
  hidden_motivation: string | null;
  relationship: number;
  status: string;
  tags: string[];
  first_arc: number;
  meta: Record<string, unknown>;
}

export type RollMode = "normal" | "advantage" | "disadvantage";

export interface DiceResult {
  stat: string; // e.g. "GUTS"
  dc: number;
  d20: number; // the KEPT die, 1..20 (nat 1/20 judged on this)
  d20b: number | null; // the discarded die when mode != normal
  mode: RollMode;
  statMod: number; // stat value applied
  stateMod: number; // mental-state modifier applied
  total: number;
  outcome: "nat1" | "fail" | "success" | "nat20";
  margin: number; // total - dc
  manual?: boolean; // player rolled physical dice and entered the result
}

export interface GameEvent {
  id: string;
  game_id: string;
  created_at: string;
  turn_no: number;
  arc: number;
  role: "dm" | "player";
  prose: string;
  summary: string | null;
  dice: DiceResult | null;
  tags: string[];
  summarized: boolean;
}

export interface Seed {
  id: string;
  game_id: string;
  created_at: string;
  description: string;
  arc_created: number;
  resolved_at_turn: number | null;
  tags: string[];
  meta: Record<string, unknown>;
}

export interface ArcJournal {
  id: string;
  game_id: string;
  arc: number;
  body: string;
  last_turn_folded: number;
  canon: string | null;
  updated_at: string;
}

export interface Pursuit {
  id: string;
  game_id: string;
  created_at: string;
  updated_at: string;
  dream: string;
  stage: number; // 0 SPARK .. 6 THE SUMMIT
  status: "active" | "achieved" | "transformed" | "abandoned";
  next_milestone: string | null;
  note: string | null;
  meta: Record<string, unknown>;
}

export interface ChoiceOption {
  key: string; // "A".."D"
  label: string;
}

export type FlowKind = "job" | "hustle" | "business" | "investment" | "expense";

export interface MoneyFlow {
  id: string;
  game_id: string;
  created_at: string;
  updated_at: string;
  kind: FlowKind;
  name: string;
  monthly: number; // signed SGD/month (income +, expense −)
  status: "active" | "ended";
  note: string | null;
}

export interface MoneyGoal {
  id: string;
  game_id: string;
  created_at: string;
  updated_at: string;
  label: string;
  target: number;
  saved: number;
  deadline: string | null; // YYYY-MM
  source: "world" | "self";
  stakes: string | null;
  status: "active" | "met" | "failed" | "abandoned";
  note: string | null;
}

// The structured delta the DM emits via the `record_turn` tool.
export interface TurnDelta {
  summary: string;
  tags?: string[];
  choices?: ChoiceOption[];
  ingame_date?: string; // absolute "YYYY-MM", monotonic
  next_beat?: { label: string; date: string } | null; // the next dated story milestone
  scene?: { location?: string; time_of_day?: string } | null; // where/when we are now
  moment?: { action: "enter" | "resolve"; title?: string; kind?: string } | null; // zoom in/out
  awaiting_roll?: {
    stat: string;
    dc: number;
    reason: string;
    mode?: "normal" | "advantage" | "disadvantage";
    mode_reason?: string;
  } | null;
  pursuit?: {
    declare?: string; // new dream text
    stage?: number; // absolute 0..6
    status?: "active" | "achieved" | "transformed" | "abandoned";
    next_milestone?: string;
    note?: string;
  } | null;
  stats?: Partial<Record<StatKey, number>>;
  reputation?: Partial<{
    academic: number;
    social: number;
    street: number;
    family: number;
    system: number;
  }>;
  karma?: number;
  money?: number; // SGD delta — ONE-OFF events only (angbao, fine, big purchase, windfall)
  ledger?: Array<{
    action: "add" | "update" | "end";
    kind?: FlowKind;
    name: string;
    monthly?: number;
    note?: string;
  }>;
  money_goals?: Array<{
    action: "add" | "contribute" | "resolve";
    label: string;
    target?: number;
    amount?: number;
    deadline?: string;
    source?: "world" | "self";
    stakes?: string;
    outcome?: "met" | "failed" | "abandoned";
    note?: string;
  }>;
  mental_state?: MentalState;
  npc_changes?: Array<{
    name: string;
    relationship?: number;
    status?: string;
    note?: string;
    archetype?: string;
    hook?: string;
    hidden_motivation?: string;
  }>;
  new_seed?: string | null;
  confirm_chop_used?: boolean;
  advance?: { arc: number; arc_name: string; age: number } | null;
}
