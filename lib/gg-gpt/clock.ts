/**
 * The current time, in the zone that matters.
 *
 * A model's sense of "now" is its training cutoff, so any question containing
 * "today", "tonight" or "how long until" is answered with confident nonsense
 * unless the real clock is injected. Dates are also the one thing people check
 * an assistant on and immediately know it got wrong.
 *
 * Everything here uses Intl, so no timezone database is bundled.
 */

export interface ClockResult {
  text: string;
  data?: unknown;
  source: string;
}

const ZONES: Record<string, string> = {
  adelaide: "Australia/Adelaide",
  sydney: "Australia/Sydney",
  melbourne: "Australia/Melbourne",
  brisbane: "Australia/Brisbane",
  perth: "Australia/Perth",
  darwin: "Australia/Darwin",
  hobart: "Australia/Hobart",
  auckland: "Pacific/Auckland",
  tokyo: "Asia/Tokyo",
  osaka: "Asia/Tokyo",
  seoul: "Asia/Seoul",
  beijing: "Asia/Shanghai",
  shanghai: "Asia/Shanghai",
  hongkong: "Asia/Hong_Kong",
  "hong kong": "Asia/Hong_Kong",
  singapore: "Asia/Singapore",
  bangkok: "Asia/Bangkok",
  mumbai: "Asia/Kolkata",
  delhi: "Asia/Kolkata",
  india: "Asia/Kolkata",
  dubai: "Asia/Dubai",
  istanbul: "Europe/Istanbul",
  moscow: "Europe/Moscow",
  athens: "Europe/Athens",
  berlin: "Europe/Berlin",
  paris: "Europe/Paris",
  madrid: "Europe/Madrid",
  rome: "Europe/Rome",
  amsterdam: "Europe/Amsterdam",
  zürich: "Europe/Zurich",
  zurich: "Europe/Zurich",
  stockholm: "Europe/Stockholm",
  oslo: "Europe/Oslo",
  london: "Europe/London",
  dublin: "Europe/Dublin",
  lisbon: "Europe/Lisbon",
  newyork: "America/New_York",
  "new york": "America/New_York",
  boston: "America/New_York",
  washington: "America/New_York",
  chicago: "America/Chicago",
  denver: "America/Denver",
  "los angeles": "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  seattle: "America/Los_Angeles",
  vancouver: "America/Vancouver",
  mexico: "America/Mexico_City",
  "sao paulo": "America/Sao_Paulo",
  "buenos aires": "America/Argentina/Buenos_Aires",
  cairo: "Africa/Cairo",
  lagos: "Africa/Lagos",
  nairobi: "Africa/Nairobi",
  johannesburg: "Africa/Johannesburg",
  honolulu: "Pacific/Honolulu",
};

/** The user's own zone. GG-LOUNGE is an Australian site and this is the default. */
export const HOME_ZONE = "Australia/Adelaide";

export function zoneFor(place: string): string | null {
  const key = place.toLowerCase().replace(/[^a-z ]/g, "").trim();
  return ZONES[key] ?? null;
}

function format(zone: string, when: Date): { time: string; date: string; weekday: string } {
  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(when);
  const date = new Intl.DateTimeFormat("en-AU", {
    timeZone: zone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(when);
  const weekday = new Intl.DateTimeFormat("en-AU", { timeZone: zone, weekday: "long" }).format(when);
  return { time, date, weekday };
}

/** "What's the time in Tokyo?" and "what day is it?" — answered locally. */
export function answerClock(message: string, now: Date = new Date()): ClockResult | null {
  const lower = message.toLowerCase();
  const asksTime = /\b(what(?:'s| is)? the (?:time|date)|what time is it|what day is it|what date is it|current time|todays date|what's today|whats today|what is today)\b/.test(lower);
  if (!asksTime) return null;

  // "in tokyo", "in new york"
  const m = /\b(?:in|at)\s+([a-z][a-z .'-]{1,30})/.exec(lower);
  const place = m?.[1]?.replace(/[?.!].*$/, "").trim() ?? "";
  const zone = (place && zoneFor(place)) || HOME_ZONE;
  const label = place ? place.replace(/\b\w/g, c => c.toUpperCase()) : "your time";
  const f = format(zone, now);

  const isDateOnly = /\b(what day|what date|todays date|what's today|whats today|what is today)\b/.test(lower);
  const text = isDateOnly
    ? `${f.weekday}, ${f.date}${place ? ` in ${label}` : ""}`
    : `${f.time}, ${f.weekday} ${f.date}${place ? ` in ${label}` : ""}`;

  return {
    text,
    data: { zone, ...f, iso: now.toISOString() },
    source: "clock",
  };
}

/** A one-line "now" for the system prompt, so the model never guesses the date. */
export function clockLine(now: Date, zone: string = HOME_ZONE): string {
  const f = format(zone, now);
  const offset = new Intl.DateTimeFormat("en-AU", { timeZone: zone, timeZoneName: "shortOffset" })
    .formatToParts(now)
    .find(p => p.type === "timeZoneName")?.value ?? "";
  return `Right now it is ${f.time} on ${f.weekday} ${f.date} (${zone}${offset ? `, ${offset}` : ""}). Anything after this is in the future — if you are unsure whether an event has happened, say so rather than guessing.`;
}
