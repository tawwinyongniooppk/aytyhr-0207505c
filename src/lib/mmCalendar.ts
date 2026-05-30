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
