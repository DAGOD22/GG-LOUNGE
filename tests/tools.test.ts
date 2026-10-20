import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../components/tools/Tools';

test('calculator respects precedence and parentheses', () => {
  assert.equal(evaluate('2+3*4'), 14);
  assert.equal(evaluate('(1+2)*3'), 9);
  assert.equal(evaluate('2*(3+4)/7'), 2);
  assert.equal(evaluate('10-2-3'), 5);
});

test('calculator handles decimals, remainders and unary minus', () => {
  assert.equal(evaluate('10/4'), 2.5);
  assert.equal(evaluate('7%3'), 1);
  assert.equal(evaluate('-5+2'), -3);
  assert.equal(evaluate('3*-2'), -6);
  assert.equal(evaluate('0.5+0.25'), 0.75);
});

test('calculator never evaluates injected code and rejects nonsense', () => {
  // Only digits, brackets and operators are tokenised; everything else is
  // dropped, so script text can never reach an evaluator.
  assert.equal(evaluate('12abc'), 12);       // letters are ignored, not executed
  assert.equal(evaluate('abc'), null);
  assert.equal(evaluate('1;2'), null);       // two numbers with no operator is not an expression
  assert.equal(evaluate('(1+2'), null);      // unbalanced brackets
  assert.equal(evaluate(''), null);
  assert.equal(evaluate('   '), null);

  // Hostile input must always return null or a finite number — never throw,
  // never run anything, never return a non-number.
  for (const hostile of ['alert(1)', 'process.exit(1)', '__proto__', 'constructor', '1e309', '()()()', '(((', ')))))', '1/0*0', '\\\\']) {
    let result: unknown;
    assert.doesNotThrow(() => { result = evaluate(hostile); }, hostile);
    assert.ok(result === null || typeof result === 'number', `${hostile} -> ${result}`);
  }
  assert.equal((globalThis as Record<string, unknown>).pwned, undefined);
});

test('calculator surfaces divide-by-zero as NaN rather than crashing', () => {
  assert.ok(Number.isNaN(evaluate('5/0') as number));
  assert.ok(Number.isNaN(evaluate('5%0') as number));
});
