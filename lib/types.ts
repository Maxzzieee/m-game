// Shared domain types. Mirrors supabase/schema.sql.

export type Stereotype = "Mugger" | "Athlete" | "Joker" | "Pai Kia" | "Average Joe";

export type MentalState = "Fresh" | "Tired" | "Stress" | "Burnt Out" | "On Fire";

export type StatKey = "brains" | "face" | "brawn" | "guts";
export type RepKey = "rep_academic" | "rep_social" | "rep_street" | "rep_family" | "rep_system";

export interface Game {
  id: string;
  created_at: string;
  updated_at: string;

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

export interface DiceResult {
  stat: string; // e.g. "GUTS"
  dc: number;
  d20: number; // raw 1..20
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

// The structured delta the DM emits via the `record_turn` tool.
export interface TurnDelta {
  summary: string;
  tags?: string[];
  awaiting_roll?: { stat: string; dc: number; reason: string } | null;
  stats?: Partial<Record<StatKey, number>>;
  reputation?: Partial<{
    academic: number;
    social: number;
    street: number;
    family: number;
    system: number;
  }>;
  karma?: number;
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
