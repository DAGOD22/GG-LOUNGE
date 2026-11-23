/**
 * GG-GPT intent detection.
 *
 * The assistant is only "really smart" if it reaches for the right tool at the
 * right moment and otherwise stays out of the way. This module is the router:
 * given a message, decide whether to search the web, look up live weather, pull
 * an exchange rate, convert a unit, price a coin, define a word, or search the
 * game catalogue — and extract the arguments to do it.
 *
 * Rules encoded here:
 *   · live data (weather, price, rates) is *always* worth a tool call, because a
 *     model cannot know it and will otherwise confidently guess
 *   · a search is worth it for anything with a recency signal
 *   · conversational messages trigger nothing at all
 */

import { solveArithmetic } from "./math";

export interface Intent {
  search?: { query: string };
  weather?: { place: string };
  currency?: { amount: number; from: string; to: string };
  unit?: { amount: number; from: string; to: string };
  crypto?: { ids: string[] };
  define?: { word: string };
  math?: { expression: string; value: number; pretty: string };
  clock?: { place?: string };
  catalogue?: { query: string };
  image?: { prompt: string; width?: number; height?: number };
  video?: { prompt: string };
  /** The message is a follow-up that needs no fresh tool data. */
  conversational?: boolean;
}

const COIN_IDS: Record<string, string> = {
  btc: "bitcoin", bitcoin: "bitcoin",
  eth: "ethereum", ethereum: "ethereum", ether: "ethereum",
  sol: "solana", solana: "solana",
  doge: "dogecoin", dogecoin: "dogecoin",
  xrp: "ripple", ripple: "ripple",
  ada: "cardano", cardano: "cardano",
  bnb: "binancecoin",
  ltc: "litecoin", litecoin: "litecoin",
  dot: "polkadot", polkadot: "polkadot",
  avax: "avalanche-2",
  link: "chainlink",
};

const CURRENCIES: Record<string, string> = {
  usd: "USD", dollar: "USD", dollars: "USD", buck: "USD", bucks: "USD", "$": "USD",
  aud: "AUD", "australian dollar": "AUD", "australian dollars": "AUD", aus: "AUD",
  cad: "CAD", "canadian dollar": "CAD", "canadian dollars": "CAD",
  nzd: "NZD", "new zealand dollar": "NZD",
  gbp: "GBP", pound: "GBP", pounds: "GBP", sterling: "GBP", "£": "GBP",
  eur: "EUR", euro: "EUR", euros: "EUR", "€": "EUR",
  jpy: "JPY", yen: "JPY", "¥": "JPY",
  cny: "CNY", yuan: "CNY", rmb: "CNY",
  inr: "INR", rupee: "INR", rupees: "INR",
  brl: "BRL", real: "BRL", reais: "BRL",
  zar: "ZAR", rand: "ZAR",
  chf: "CHF", franc: "CHF", francs: "CHF",
  sek: "SEK", nok: "NOK", dkk: "DKK", pln: "PLN", try: "TRY",
  krw: "KRW", won: "KRW", sgd: "SGD", hkd: "HKD", mxn: "MXN", peso: "MXN", pesos: "MXN",
  thb: "THB", baht: "THB", idr: "IDR", myr: "MYR", php: "PHP", vnd: "VND",
};

/** Longest-first so "miles" is tried before "mi". */
const UNIT_WORDS: Array<[RegExp, string]> = [
  [/\b(?:kilometres?|kilometers?|km)\b/i, "km"],
  [/\b(?:centimetres?|centimeters?|cm)\b/i, "cm"],
  [/\b(?:millimetres?|millimeters?|mm)\b/i, "mm"],
  [/\b(?:metres?|meters?|m)\b/i, "m"],
  [/\b(?:miles?|mi)\b/i, "mi"],
  [/\b(?:yards?|yd)\b/i, "yd"],
  [/\b(?:feet|foot|ft)\b/i, "ft"],
  [/\b(?:inches|inch|in)\b/i, "in"],
  [/\b(?:kilograms?|kilos?|kg)\b/i, "kg"],
  [/\b(?:grams?|g)\b/i, "g"],
  [/\b(?:milligrams?|mg)\b/i, "mg"],
  [/\b(?:pounds?|lbs?|lb)\b/i, "lb"],
  [/\b(?:ounces?|oz)\b/i, "oz"],
  [/\b(?:litres?|liters?|l)\b/i, "l"],
  [/\b(?:millilitres?|milliliters?|ml)\b/i, "ml"],
  [/\b(?:gallons?|gal)\b/i, "gal"],
  [/\b(?:celsius|centigrade|°c)\b/i, "c"],
  [/\b(?:fahrenheit|°f)\b/i, "f"],
  // Bare "f"/"c" only count as temperature when nothing else matched; handled
  // by the explicit check in detectIntent so "5 c to f" works but "5 g to f"
  // does not silently become a temperature.
  [/\bkelvin\b/i, "k"],
  [/\b(?:hours?|hrs?|h)\b/i, "h"],
  [/\b(?:minutes?|mins?)\b/i, "min"],
  [/\b(?:seconds?|secs?|s)\b/i, "s"],
  [/\b(?:days?)\b/i, "day"],
  [/\b(?:weeks?)\b/i, "week"],
  [/\b(?:years?)\b/i, "year"],
];

/** Find a unit mentioned in a fragment, preferring the longest match. */
function findUnit(fragment: string): string | null {
  const lower = fragment.toLowerCase();
  for (const [re, canonical] of UNIT_WORDS) {
    if (re.test(lower)) return canonical;
  }
  return null;
}

function findCurrency(fragment: string): string | null {
  const lower = fragment.toLowerCase().trim();
  if (CURRENCIES[lower]) return CURRENCIES[lower];
  // Longest word first so "australian dollars" beats "dollars".
  const keys = Object.keys(CURRENCIES).filter(k => k.length > 1).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) return CURRENCIES[k];
  }
  return null;
}

/** Words that mean "this needs current information". */
const RECENCY =
  /\b(latest|newest|current(ly)?|today|tonight|tomorrow|yesterday|this (week|month|year)|right now|recent(ly)?|news|headlines?|who (?:is|was|won|are|did)|score|results?|release[d]?|launch(ed)?|update[d]?|version|price|cost|how much|stock|weather|forecast|trending|election|died|born|age of|how old|when (is|was|did|does|will))\b/i;

const IMAGE_VERB = /^\s*(?:please\s+)?(?:can you\s+|could you\s+|would you\s+)?(?:generate|make|create|draw|render|design|paint|sketch|imagine)\s+(?:me\s+)?/i;

/** Strip "an image of" style scaffolding so the prompt is just the subject. */
function cleanImagePrompt(raw: string): string {
  return raw
    .replace(/^(?:an?\s+)?(?:image|picture|photo|artwork|art|illustration|drawing|logo|poster|wallpaper|thumbnail|avatar|icon)\s+(?:of|for|showing|with)\s+/i, "")
    .replace(/^(?:an?\s+)?(?:image|picture|photo|artwork|art|illustration|drawing|logo|poster|wallpaper|thumbnail|avatar|icon)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectIntent(message: string): Intent {
  const m = message.trim();
  const lower = m.toLowerCase();
  const intent: Intent = {};

  /* ---- image / video (first: explicit and unambiguous) ---- */
  const vidMatch = IMAGE_VERB.exec(m);
  const verbRest = vidMatch ? m.slice(vidMatch[0].length).replace(/\s+/g, " ").trim() : "";

  if (verbRest && /\b(video|clip|animation|short film)\b/i.test(verbRest)) {
    const prompt = cleanImagePrompt(verbRest.replace(/^(?:an?\s+)?(?:video|clip|animation|short film)\s*(?:of|for|showing)?\s*/i, ""));
    if (prompt.length > 2) {
      intent.video = { prompt };
      return intent;
    }
  }

  if (verbRest && /\b(image|picture|photo|art|artwork|illustration|drawing|logo|poster|wallpaper|thumbnail|avatar|icon)\b/i.test(verbRest)) {
    const prompt = cleanImagePrompt(verbRest);
    if (prompt.length > 2) {
      intent.image = { prompt };
      if (/\b(wide|landscape|16:9|banner)\b/i.test(lower)) { intent.image.width = 1344; intent.image.height = 768; }
      if (/\b(tall|portrait|9:16|vertical)\b/i.test(lower)) { intent.image.width = 768; intent.image.height = 1344; }
      if (/\b(square|1:1)\b/i.test(lower)) { intent.image.width = 1024; intent.image.height = 1024; }
      return intent;
    }
  }
  // "draw a dragon" — verb with no noun still means an image.
  if (verbRest && /^(?:draw|paint|sketch|illustrate|render|imagine)\b/i.test(m.trim()) && verbRest.length > 2) {
    intent.image = { prompt: verbRest };
    return intent;
  }
  if (verbRest && /\b(?:generate|make|create|render|design)\b/i.test(m.trim()) && verbRest.length > 2 && !/\b(?:list|plan|code|function|script|essay|email|summary|table)\b/i.test(verbRest)) {
    // Ambiguous "make me a ..." — only treat as an image when it names a visual.
    if (/\b(?:logo|poster|wallpaper|banner|thumbnail|avatar|icon|art|artwork)\b/i.test(verbRest)) {
      intent.image = { prompt: verbRest };
      return intent;
    }
  }

  /* ---- clock ---- */
  if (/\b(what(?:'s| is)? the (?:time|date)|what time is it|what day is it|what date is it|current time)\b/i.test(lower)) {
    const place = /\b(?:in|at)\s+([a-z][a-z .'-]{1,30})/i.exec(m)?.[1]?.replace(/[?.!].*$/, "").trim();
    intent.clock = { place };
    return intent;
  }

  /* ---- arithmetic (exact, instant, never ask a model to do sums) ---- */
  const arith = solveArithmetic(m);
  if (arith) {
    intent.math = arith;
    return intent;
  }

  /* ---- crypto ---- */
  if (/\b(price|worth|value|how much is|trading at|cost of|rate of)\b/i.test(lower) && /\b(crypto|bitcoin|btc|eth|ethereum|solana|doge|dogecoin|xrp|cardano|bnb|litecoin|polkadot|coin)\b/i.test(lower)) {
    const ids = new Set<string>();
    for (const [word, id] of Object.entries(COIN_IDS)) {
      if (new RegExp(`\\b${word}\\b`, "i").test(lower)) ids.add(id);
    }
    if (ids.size) {
      intent.crypto = { ids: [...ids].slice(0, 4) };
      return intent;
    }
  }

  /* ---- weather ---- */
  if (/\b(weather|forecast|temperature|raining|rain|snow(ing)?|humidity|windy|winds)\b/i.test(lower)) {
    const place =
      /\b(?:weather|forecast|temperature)\s+(?:in|at|for)\s+([A-Za-z][A-Za-z .'-]{1,40})/i.exec(m)?.[1] ||
      /\b(?:in|at|near)\s+([A-Z][A-Za-z .'-]{1,40})\s*(?:[?.!]|$)/.exec(m)?.[1] ||
      /\b(?:here|outside|my location)\b/i.exec(m)?.[0];
    if (place && !/^(the|a|an|this|that|it|is|now|today|tomorrow)$/i.test(place.trim())) {
      intent.weather = { place: place.trim().replace(/[?.!,]+$/, "") };
      return intent;
    }
  }

  /* ---- unit conversion (forward and reverse phrasing) ---- */
  // Temperature shorthand: "100 f to c", "20 c in f".
  const tempF = /(-?\d+(?:\.\d+)?)\s*(?:degrees?\s*)?([fc])\s*(?:to|into|in)\s*(?:degrees?\s*)?([fc])\b/i.exec(m);
  if (tempF && tempF[2].toLowerCase() !== tempF[3].toLowerCase()) {
    intent.unit = { amount: Number(tempF[1]), from: tempF[2].toLowerCase(), to: tempF[3].toLowerCase() };
    return intent;
  }

  // "12 km to miles" / "26.2 miles in km" / "100 f to c"
  const fwd = /(-?\d+(?:\.\d+)?)\s*([A-Za-z°]{1,15})[^0-9]{0,14}?\b(?:to|into|in)\s*([A-Za-z°]{1,15})\b/i.exec(m);
  if (fwd) {
    const from = findUnit(fwd[2]);
    const to = findUnit(fwd[3]);
    if (from && to && from !== to) {
      intent.unit = { amount: Number(fwd[1]), from, to };
      return intent;
    }
  }
  // "how many km is 26.2 miles"
  const rev = /\bhow many\s+([A-Za-z°]{1,15})\b[^0-9]{0,20}?(-?\d+(?:\.\d+)?)\s*([A-Za-z°]{1,15})\b/i.exec(m);
  if (rev) {
    const to = findUnit(rev[1]);
    const from = findUnit(rev[3]);
    if (from && to && from !== to) {
      intent.unit = { amount: Number(rev[2]), from, to };
      return intent;
    }
  }

  /* ---- currency conversion ---- */
  const cur = /(-?\d[\d,]*(?:\.\d+)?)\s*([A-Za-z$£€¥]{1,20})[^0-9]{0,14}?\b(?:to|into|in)\s*([A-Za-z$£€¥]{1,20})\b/i.exec(m);
  if (cur) {
    const from = findCurrency(cur[2]);
    const to = findCurrency(cur[3]);
    if (from && to && from !== to) {
      intent.currency = { amount: Number(cur[1].replace(/,/g, "")), from, to };
      return intent;
    }
  }

  /* ---- dictionary ---- */
  const STOPWORDS = /^(the|a|an|this|that|it|its|you|your|i|me|we|they|he|she|my|of|in|on|to|for|and|or|but|is|are|was|were|be|do|does|did|can|could|would|should|will|mean|means|word|phrase|term)$/i;
  const quoted =
    /(?:define|definition of|meaning of)\s+["'“]([a-z][a-z'-]{1,30})["'”]/i.exec(m) ||
    /["'“]([a-z][a-z'-]{1,30})["'”]\s+(?:mean|means)\b/i.exec(m) ||
    /\bwhat does\s+["'“]([a-z][a-z'-]{1,30})["'”]/i.exec(m);
  const bareDef = /\b(?:define|definition of|meaning of)\s+([a-z][a-z'-]{1,30})\b/i.exec(m);
  const doesMean = /\bwhat does\s+([a-z][a-z'-]{1,30})\s+mean\b/i.exec(m) ||
                   /\bwhat does\s+the\s+(?:word|term|phrase)\s+([a-z][a-z'-]{1,30})\b/i.exec(m);
  const word = quoted?.[1] || doesMean?.[1] || bareDef?.[1];
  if (word && !STOPWORDS.test(word) && !/\b(mean by|you mean)\b/i.test(lower)) {
    intent.define = { word: word.toLowerCase() };
    return intent;
  }

  /* ---- catalogue: recommendations ---- */
  if (
    /\b(recommend|suggest|what should i play|any (good )?games?|games? (like|similar to)|i want to play|find me a game|best (idle|puzzle|arcade|racing|platformer|sandbox|battle|simulation|strategy) games?|something to play)\b/i.test(lower) ||
    (/\bgame\b/.test(lower) && /\b(good|fun|best|play|recommend|bored)\b/.test(lower))
  ) {
    intent.catalogue = { query: m };
    return intent;
  }

  /* ---- web search ---- */
  if (RECENCY.test(m)) {
    intent.search = { query: m.replace(/^(hey|hi|ok|so|and)[,\s]+/i, "").slice(0, 200) };
    return intent;
  }

  intent.conversational = true;
  return intent;
}

/** Short chat titles from the first thing the user said. */
export function titleFromMessage(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  const cut = clean.slice(0, 60);
  return cut.length < clean.length ? `${cut.replace(/[,;:]$/, "")}…` : cut;
}
