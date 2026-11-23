/**
 * Exact arithmetic for GG-GPT.
 *
 * A language model is a bad calculator: it tokenises digits in unhelpful ways
 * and will confidently answer 17*23 with 391-ish nonsense. Anything that is
 * pure arithmetic should never reach the model. This module parses a small,
 * safe expression grammar — no eval, no Function constructor — and answers
 * immediately and exactly.
 *
 * Supported: + - * / % ^ ( ), unary minus, percentages ("15% of 240",
 * "20% off 80"), and the words and/plus/minus/times/divided by.
 */

const NUMBER = /\d+(?:\.\d+)?/y;

type Token = { kind: "num"; value: number } | { kind: "op"; value: string };

/** Insert * where the text implies it: "20% off 80" → "20% * 80", "3(4)" → "3*(4)". */
function normalise(input: string): string {
  let s = input.toLowerCase().trim();
  s = s.replace(/[,](?=\d{3}\b)/g, ""); // 1,000 → 1000
  s = s.replace(/\bplus\b/g, "+");
  s = s.replace(/\bminus\b/g, "-");
  s = s.replace(/\b(times|multiplied by|x)\b/g, "*");
  s = s.replace(/\b(divided by|over)\b/g, "/");
  s = s.replace(/\b(to the power of|squared)\b/g, (m) => (m === "squared" ? "^2" : "^"));
  s = s.replace(/\bpercent of\b/g, "% *");
  s = s.replace(/\bof\b/g, "*");
  s = s.replace(/\boff\b/g, "*");
  // "20% 80" → "20% * 80"
  s = s.replace(/%\s*(?=[\d(])/g, "%*");
  // "3(4)" / ")(" → implicit multiplication
  s = s.replace(/(\d|\))\s*\(/g, "$1*(");
  s = s.replace(/\)\s*(?=[\d(])/g, ")*");
  return s;
}

function tokenize(s: string): Token[] | null {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(s);
    if (m) {
      out.push({ kind: "num", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if ("+-*/%^()".includes(ch)) {
      // A leading "%" or a "%" directly after a number means "divide by 100".
      if (ch === "%") { out.push({ kind: "op", value: "/" }, { kind: "num", value: 100 }); i++; continue; }
      out.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    return null; // anything else means this is not an arithmetic expression
  }
  return out.length ? out : null;
}

const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };
const RIGHT_ASSOC = new Set(["^"]);

/** Shunting-yard, then evaluate. Returns null on malformed input. */
function evaluate(tokens: Token[]): number | null {
  const values: number[] = [];
  const ops: string[] = [];
  let expectOperand = true;

  const apply = (): boolean => {
    const op = ops.pop();
    if (!op) return false;
    const b = values.pop();
    const a = values.pop();
    if (a === undefined || b === undefined) return false;
    switch (op) {
      case "+": values.push(a + b); break;
      case "-": values.push(a - b); break;
      case "*": values.push(a * b); break;
      case "/": if (b === 0) return false; values.push(a / b); break;
      case "^": values.push(Math.pow(a, b)); break;
      default: return false;
    }
    return true;
  };

  for (const t of tokens) {
    if (t.kind === "num") {
      if (!expectOperand) return null; // "3 4"
      values.push(t.value);
      expectOperand = false;
      continue;
    }
    const op = t.value;
    if (op === "(") {
      if (!expectOperand) return null;
      ops.push(op);
      expectOperand = true;
      continue;
    }
    if (op === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") {
        if (!apply()) return null;
      }
      if (ops.pop() !== "(") return null;
      expectOperand = false;
      continue;
    }
    // Unary minus / plus.
    if (expectOperand && (op === "-" || op === "+")) {
      values.push(0);
      ops.push(op);
      continue;
    }
    if (expectOperand) return null;
    while (ops.length) {
      const top = ops[ops.length - 1];
      if (top === "(") break;
      if (RIGHT_ASSOC.has(op) ? PRECEDENCE[top] > PRECEDENCE[op] : PRECEDENCE[top] >= PRECEDENCE[op]) {
        if (!apply()) return null;
      } else break;
    }
    ops.push(op);
    expectOperand = true;
  }
  while (ops.length) {
    if (ops[ops.length - 1] === "(") return null;
    if (!apply()) return null;
  }
  if (values.length !== 1) return null;
  const v = values[0];
  return Number.isFinite(v) ? v : null;
}

/** Trim float noise: 0.1+0.2 → 0.3, not 0.30000000000000004. */
export function pretty(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString("en-AU");
  const rounded = Number(n.toPrecision(12));
  return rounded.toLocaleString("en-AU", { maximumFractionDigits: 8 });
}

/**
 * Try to read a message as pure arithmetic. Returns null when it is not one,
 * which is the common case — "what is 2+2" is arithmetic, "what is a quokka"
 * is not.
 */
export function solveArithmetic(message: string): { expression: string; value: number; pretty: string } | null {
  const raw = message.trim().replace(/^[^\w(-]*/, "");
  if (!raw) return null;
  // Nothing numeric → not arithmetic.
  if (!/\d/.test(raw)) return null;
  // Strip conversational scaffolding around the expression.
  const candidate = raw
    .replace(/^(?:hey|hi|ok|so)?[,\s]*/i, "")
    .replace(/^(?:what(?:'s| is)|whats|calculate|compute|solve|evaluate|work out|tell me|how much is|answer)\b[: ]*/i, "")
    .replace(/\?+$/, "")
    .replace(/\s*=\s*$/, "")
    .trim();
  if (!candidate) return null;

  // "20% off 80" means the sale price, not the discount: 80 - 20% of 80.
  const off = /^(-?\d+(?:\.\d+)?)\s*%\s*off\s*(-?\d+(?:\.\d+)?)$/i.exec(candidate);
  if (off) {
    const pct = Number(off[1]);
    const base = Number(off[2]);
    const value = base * (1 - pct / 100);
    return { expression: candidate, value, pretty: pretty(value) };
  }

  const normalised = normalise(candidate);
  // A bare number is not a question worth answering.
  if (/^-?\d+(?:\.\d+)?$/.test(normalised)) return null;
  // Must contain an operator to be worth computing.
  if (!/[+\-*/^%]/.test(normalised)) return null;
  // Bail out if there are stray words left — those belong to a real question.
  const leftover = normalised.replace(/[0-9+\-*/^%().\s]/g, "");
  if (leftover.length > 0) return null;
  // Guard against pathological input.
  if (candidate.length > 200) return null;

  const tokens = tokenize(normalised);
  if (!tokens) return null;
  const value = evaluate(tokens);
  if (value === null) return null;
  return { expression: candidate, value, pretty: pretty(value) };
}
