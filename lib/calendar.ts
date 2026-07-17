// Calendar-aware Singapore. Pure functions: given "YYYY-MM" (+ age), derive the
// season, nearby festivals, the school calendar, and exam-year pressure — as a
// compact line for the DM's GAME STATE and an ambiance hint for the UI.

export interface SgCalendar {
  year: number;
  month: number; // 1..12
  season: string;
  festivals: string[];
  school: string;
  examYear: string | null;
  line: string; // the one-liner injected into the prompt
  shortLabel: string; // "Mar 2017" for the UI header
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Approximate Hari Raya Puasa month by year (drifts ~11 days/year earlier).
const HARI_RAYA_MONTH: Record<number, number> = {
  2016: 7, 2017: 6, 2018: 6, 2019: 6, 2020: 5, 2021: 5, 2022: 5,
  2023: 4, 2024: 4, 2025: 3, 2026: 3, 2027: 3, 2028: 2, 2029: 2,
  2030: 1, 2031: 1, 2032: 1, 2033: 12,
};

function season(month: number): string {
  if (month === 11 || month === 12 || month === 1) {
    return "northeast monsoon — heavy afternoon downpours, cooler evenings";
  }
  if (month >= 5 && month <= 7) return "southwest monsoon — Sumatra squalls before dawn, humid";
  if (month >= 8 && month <= 10) return "inter-monsoon — still, hot, haze risk from Sumatra fires";
  return "inter-monsoon — hot, sudden thunderstorms";
}

function festivals(year: number, month: number): string[] {
  const out: string[] = [];
  if (month === 1 || month === 2) out.push("Chinese New Year (angbao, reunion dinner, relatives asking about results)");
  if (HARI_RAYA_MONTH[year] === month) out.push("Hari Raya Puasa (open houses, rendang, green packets)");
  if (month === 8) out.push("National Day (fireworks from the HDB corridor, NDP on TV)");
  if (month === 10 || month === 11) out.push("Deepavali (Little India lights)");
  if (month === 12) out.push("Christmas (Orchard Road lights, year-end sales)");
  if (month === 7) out.push("Youth Day + racial harmony month vibes at school");
  return out;
}

// School calendar (MOE rhythm) — relevant while the player is in the system.
function school(month: number): string {
  if (month === 1) return "Term 1 begins — new classes, new seating plans";
  if (month === 3) return "March holidays (one week)";
  if (month === 5) return "mid-year exams loom";
  if (month === 6) return "June holidays — the month everything happens";
  if (month === 9) return "September holidays (one week)";
  if (month === 10 || month === 11) return "final exams / national exams season";
  if (month === 12) return "December holidays — long, hot, free";
  return "term time";
}

// Which national exam hangs over this age (secondary arc onwards).
function examYear(age: number): string | null {
  if (age === 16) return "O/N-LEVELS YEAR — the whole year bends around October";
  if (age === 18) return "A-levels / poly finals year";
  if (age === 12) return "PSLE year";
  return null;
}

export function sgCalendar(ingameDate: string, age: number): SgCalendar {
  const m = ingameDate.match(/^(\d{4})-(\d{2})$/);
  const year = m ? parseInt(m[1], 10) : 2016;
  const month = m ? Math.min(12, Math.max(1, parseInt(m[2], 10))) : 1;

  const fest = festivals(year, month);
  const sch = school(month);
  const exam = examYear(age);

  const bits = [
    `${MONTHS[month - 1]} ${year}`,
    season(month),
    sch,
    ...(fest.length ? [`festivals: ${fest.join("; ")}`] : []),
    ...(exam ? [exam] : []),
  ];

  return {
    year,
    month,
    season: season(month),
    festivals: fest,
    school: sch,
    examYear: exam,
    line: bits.join(" · "),
    shortLabel: `${MONTHS[month - 1]} ${year}`,
  };
}

// Ambiance fallback tint by month (used by the UI when scene tags don't decide).
export function calendarAmbiance(ingameDate: string): string | null {
  const m = ingameDate.match(/^\d{4}-(\d{2})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  if (month === 11 || month === 12) return "rgba(70, 92, 138, 0.10)"; // monsoon blue
  if (month === 1 || month === 2) return "rgba(206, 17, 38, 0.09)"; // CNY red
  if (month === 8) return "rgba(206, 17, 38, 0.11)"; // National Day — proud red
  if (month >= 8 && month <= 10) return "rgba(160, 140, 90, 0.10)"; // haze
  return null;
}
