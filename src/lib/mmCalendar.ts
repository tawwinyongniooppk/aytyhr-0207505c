// Myanmar calendar helpers + gazette / public holiday list.
// Holidays here are treated as automatic Off Days in the calendar UI.

// @ts-expect-error – plain CommonJS package, no TS types
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
// Key: "MM-DD"
const FIXED_MM_HOLIDAYS: Record<string, string> = {
  "01-01": "New Year's Day",
  "01-04": "Independence Day",
  "02-12": "Union Day",
  "03-02": "Peasants' Day",
  "03-27": "Armed Forces Day",
  "04-13": "Thingyan (Water Festival)",
  "04-14": "Thingyan (Water Festival)",
  "04-15": "Thingyan (Water Festival)",
  "04-16": "Thingyan (Water Festival)",
  "04-17": "Myanmar New Year",
  "05-01": "Labour Day",
  "07-19": "Martyrs' Day",
  "12-25": "Christmas Day",
  "12-31": "New Year's Eve",
};

// Specific Myanmar lunar / moveable holidays (gazetted dates per year).
// Add years as needed; absence simply means no extra moveable holiday is shown.
const MOVEABLE_MM_HOLIDAYS: Record<string, string> = {
  // 2025
  "2025-03-13": "Full Moon of Tabaung",
  "2025-05-12": "Full Moon of Kason",
  "2025-07-10": "Full Moon of Waso (Dhammasekya Day)",
  "2025-10-06": "Thadingyut Festival",
  "2025-10-07": "Thadingyut Festival",
  "2025-10-08": "Thadingyut Festival",
  "2025-11-04": "Tazaungdaing Festival",
  "2025-11-05": "Tazaungdaing Festival",
  "2025-11-21": "National Day",
  // 2026
  "2026-03-03": "Full Moon of Tabaung",
  "2026-05-01": "Full Moon of Kason",
  "2026-07-29": "Full Moon of Waso (Dhammasekya Day)",
  "2026-10-25": "Thadingyut Festival",
  "2026-10-26": "Thadingyut Festival",
  "2026-10-27": "Thadingyut Festival",
  "2026-11-23": "Tazaungdaing Festival",
  "2026-11-24": "Tazaungdaing Festival",
  "2026-12-10": "National Day",
  // 2027
  "2027-02-21": "Full Moon of Tabaung",
  "2027-04-20": "Full Moon of Kason",
  "2027-07-18": "Full Moon of Waso (Dhammasekya Day)",
  "2027-10-14": "Thadingyut Festival",
  "2027-10-15": "Thadingyut Festival",
  "2027-10-16": "Thadingyut Festival",
  "2027-11-13": "Tazaungdaing Festival",
  "2027-11-14": "Tazaungdaing Festival",
  "2027-11-29": "National Day",
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
