// Myanmar calendar helpers + gazette / public holiday list.
// Holidays here are treated as automatic Off Days in the calendar UI.
// Source: timeanddate.com Myanmar public-holidays gazette (2025, 2026).

// @ts-ignore – plain CommonJS package, no TS types
// eslint-disable-next-line @typescript-eslint/no-var-requires
import mcal from "myanmar-calendar";

export function toMyanmarDate(date: Date): string {
  try {
    return mcal.toMyanmar(date, "mm") as string;
  } catch {
    return "";
  }
}

export function toMyanmarDateEn(date: Date): string {
  try {
    return mcal.toMyanmar(date, "en") as string;
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Myanmar moon-phase (လဆန်း / လပြည့် / လဆုတ် / လကွယ်)
// Astronomical approximation against a known new-moon reference. Accuracy is
// ±1 day vs the official gazette, which is sufficient for showing the
// waxing/full/waning/new tag alongside the existing Myanmar-date string.
// Reference new moon: 2000-01-06 18:14 UTC (synodic month 29.530588853 days).
// ─────────────────────────────────────────────────────────────────────────────
const SYNODIC_MONTH_MS = 29.530588853 * 24 * 60 * 60 * 1000;
const REF_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);

const MM_DIGITS = ["၀", "၁", "၂", "၃", "၄", "၅", "၆", "၇", "၈", "၉"];
function toMyanmarNumeral(n: number): string {
  return String(n).split("").map((c) => MM_DIGITS[Number(c)] ?? c).join("");
}

export type MyanmarMoonPhase = {
  /** 1-30 within the synodic cycle */
  day: number;
  /** "waxing" | "full" | "waning" | "new" */
  phase: "waxing" | "full" | "waning" | "new";
  /** Myanmar label, e.g. "လဆန်း ၇ ရက်", "လပြည့်", "လဆုတ် ၃ ရက်", "လကွယ်" */
  label: string;
};

export function getMyanmarMoonPhase(date: Date): MyanmarMoonPhase {
  // Use noon Yangon time to stabilize day boundary.
  const yangonNoon = new Date(date);
  yangonNoon.setUTCHours(5, 30, 0, 0); // 12:00 MMT == 05:30 UTC
  const ageMs = ((yangonNoon.getTime() - REF_NEW_MOON_MS) % SYNODIC_MONTH_MS + SYNODIC_MONTH_MS) % SYNODIC_MONTH_MS;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  // Lunar day 1..30 (day 1 = new-moon day, day 15 = full, day 30 = new again)
  let day = Math.floor(ageDays) + 1;
  if (day > 30) day = 30;

  let phase: MyanmarMoonPhase["phase"];
  let label: string;
  if (day === 15) {
    phase = "full";
    label = "လပြည့်";
  } else if (day === 30 || day === 29) {
    // Cycle wraps; treat last day before next new moon as လကွယ်.
    phase = "new";
    label = "လကွယ်";
  } else if (day < 15) {
    phase = "waxing";
    label = `လဆန်း ${toMyanmarNumeral(day)} ရက်`;
  } else {
    phase = "waning";
    label = `လဆုတ် ${toMyanmarNumeral(day - 15)} ရက်`;
  }
  return { day, phase, label };
}


// Fixed-date Myanmar gazette / public holidays (recurring every year).
// Key: "MM-DD". Lunar / movable holidays (Thingyan, full-moon days, Thadingyut,
// Tazaungdaing, National Day, etc.) are listed per-year in MOVEABLE_MM_HOLIDAYS
// since their Gregorian dates shift each year.
const FIXED_MM_HOLIDAYS: Record<string, string> = {
  "01-01": "New Year's Day",
  "01-04": "Independence Day",
  "02-12": "Union Day",
  "03-02": "Peasants' Day",
  "03-27": "Armed Forces Day",
  "05-01": "Labour Day",
  "07-19": "Martyrs' Day",
  "12-25": "Christmas Day",
};

// Year-specific gazetted holidays. Verified against timeanddate.com Myanmar
// public-holidays list (2025, 2026). 2027 will be appended once gazetted.
const MOVEABLE_MM_HOLIDAYS: Record<string, string> = {
  // ───── 2025 ─────
  "2025-01-29": "Chinese New Year",
  "2025-03-13": "Full Moon of Tabaung",
  "2025-04-13": "Maha Thingyan (Water Festival)",
  "2025-04-14": "Maha Thingyan (Water Festival)",
  "2025-04-15": "Maha Thingyan (Water Festival)",
  "2025-04-16": "Maha Thingyan (Water Festival)",
  "2025-04-17": "Maha Thingyan (Water Festival)",
  "2025-04-18": "Maha Thingyan (Water Festival)",
  "2025-04-19": "Myanmar New Year",
  "2025-04-20": "Myanmar New Year Holiday",
  "2025-04-21": "Myanmar New Year Holiday",
  "2025-04-22": "Myanmar New Year Holiday",
  "2025-05-11": "Full Moon of Kason",
  "2025-06-07": "Eid al-Adha",
  "2025-07-09": "Full Moon of Waso (Dhammasekya Day)",
  "2025-10-05": "Thadingyut Festival",
  "2025-10-06": "Thadingyut Festival",
  "2025-10-07": "Thadingyut Festival",
  "2025-10-08": "Thadingyut Festival",
  "2025-10-20": "Diwali (Deepavali)",
  "2025-11-04": "Tazaungdaing Festival",
  "2025-11-14": "National Day",
  "2025-12-19": "Kayin New Year Day",

  // ───── 2026 ─────
  "2026-01-02": "New Year Holiday",
  "2026-02-13": "Union Day Holiday",
  "2026-02-16": "Chinese New Year",
  "2026-02-17": "Chinese New Year Holiday",
  "2026-03-02": "Full Moon of Tabaung",
  "2026-04-11": "Maha Thingyan (Water Festival)",
  "2026-04-12": "Maha Thingyan (Water Festival)",
  "2026-04-13": "Maha Thingyan (Water Festival)",
  "2026-04-14": "Maha Thingyan (Water Festival)",
  "2026-04-15": "Maha Thingyan (Water Festival)",
  "2026-04-16": "Maha Thingyan (Water Festival)",
  "2026-04-17": "Myanmar New Year",
  "2026-04-18": "Myanmar New Year Holiday",
  "2026-04-19": "Myanmar New Year Holiday",
  "2026-04-30": "Full Moon of Kason",
  "2026-05-28": "Eid al-Adha",
  "2026-07-29": "Full Moon of Waso (Dhammasekya Day)",
  "2026-10-25": "Thadingyut Festival",
  "2026-10-26": "Thadingyut Festival",
  "2026-10-27": "Thadingyut Festival",
  "2026-11-23": "Tazaungdaing Festival",
  "2026-11-24": "Tazaungdaing Festival",
  "2026-12-04": "National Day",
};

/** Returns the holiday name for `YYYY-MM-DD`, or null. */
export function getMyanmarHoliday(dateStr: string): string | null {
  if (!dateStr) return null;
  if (MOVEABLE_MM_HOLIDAYS[dateStr]) return MOVEABLE_MM_HOLIDAYS[dateStr];
  const md = dateStr.slice(5); // MM-DD
  return FIXED_MM_HOLIDAYS[md] || null;
}

export function isMyanmarHoliday(dateStr: string): boolean {
  return !!getMyanmarHoliday(dateStr);
}
