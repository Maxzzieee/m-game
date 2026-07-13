// Shared domain types. Mirrors supabase/schema.sql.

export type Stereotype = "Mugger" | "Athlete" | "Joker" | "Pai Kia" | "Average Joe";

export type MentalState = "Fresh" | "Tired" | "Stress" | "Burnt Out" | "On Fire";

export type StatKey = "brains" | "face" | "brawn" | "guts";
export type RepKey = "rep_academic" | "rep_social" | "rep_street" | "rep_family" | "rep_system";

export interface Game {
  id: string;
  created_at: string;
  updated_at: string;
  profile: string; // 'main' | 'p2' — which household player owns this save

  char_name: string;
  stereotype: Stereotype;
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

  dm_model_pref: "standard" | "big";
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

// The structured delta the DM emits via the `record_turn` tool.
export interface TurnDelta {
  summary: string;
  tags?: string[];
  choices?: ChoiceOption[];
  ingame_date?: string; // absolute "YYYY-MM", monotonic
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
  money?: number; // SGD delta: allowance, angbao, part-time pay, fines, treats
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
