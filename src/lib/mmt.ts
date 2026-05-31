const MMT_TIME_ZONE = "Asia/Yangon";

function formatInMMT(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions,
  locale = "en-CA",
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: MMT_TIME_ZONE,
    ...options,
  }).format(new Date(value));
}

export function getMMTDateParts(value: string | number | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MMT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return { year, month, day };
}

export function getMMTTodayISO() {
  const { year, month, day } = getMMTDateParts(new Date());
  return `${year}-${month}-${day}`;
}

export function getMMTMonthStartISO() {
  const { year, month } = getMMTDateParts(new Date());
  return `${year}-${month}-01`;
}

export function formatMMTDate(value: string | number | Date, locale = "en-US") {
  return formatInMMT(
    value,
    { day: "2-digit", month: "short", year: "numeric" },
    locale,
  );
}

export function formatMMTDateTime(value: string | number | Date, locale = "en-US") {
  return formatInMMT(
    value,
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    },
    locale,
  );
}

export function formatMMTMonthLabel(value: string | number | Date, locale = "en-US") {
  return formatInMMT(value, { month: "long", year: "numeric" }, locale);
}
