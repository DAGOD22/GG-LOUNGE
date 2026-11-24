import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Playtime accounting.
 *
 * This pins a bug that had been shipping silently: the modal ticked `timeRef`
 * by 4 seconds and only uploaded when `timeRef % 30 === 0`. Starting from a
 * saved lifetime total, that condition is almost never true — after 30 seconds
 * of play the ref reads (total + 32), and `% 30 === 0` skips right past it. No
 * session ever reported a single second.
 *
 * The accumulation model below is what the component now uses, extracted so it
 * can be asserted without a DOM: add elapsed seconds to a pending total, flush
 * when it crosses the threshold, subtract only once the write is acknowledged.
 */

const FLUSH_AFTER = 30;

function makeMeter(ackAlwaysTrue = true) {
  let pending = 0;
  let totalSaved = 0;
  const uploads: number[] = [];

  return {
    /** One tick of the game loop. */
    tick(seconds = 4) {
      pending += seconds;
      if (pending >= FLUSH_AFTER) this.flush();
    },
    /** Send what is pending. `ack` decides whether it counted. */
    flush(ack = ackAlwaysTrue) {
      if (pending <= 0) return 0;
      const sending = pending;
      uploads.push(sending);
      if (ack) {
        pending -= sending;
        totalSaved += sending;
      }
      return sending;
    },
    get pending() { return pending; },
    get saved() { return totalSaved; },
    get uploads() { return uploads; },
  };
}

test('the old arithmetic under-reported, and for half of all players reported nothing', () => {
  // The shipped condition was `timeRef.current % 30 === 0` after `+= 4`, where
  // timeRef starts at the SAVED LIFETIME total. Ticking by 4 from an even total
  // reaches a multiple of 30 every 15 ticks (60 s of play) and then uploads the
  // flat figure 30 — so it under-reported by half. From an ODD total it can
  // never reach a multiple of 30 at all, because gcd(4, 30) = 2: every odd
  // lifetime total recorded exactly zero playtime, forever.
  const firesWithin60Ticks = (lifetime: number) => {
    let ref = lifetime;
    for (let tick = 0; tick < 60; tick++) {
      ref += 4;
      if (ref % 30 === 0) return true;
    }
    return false;
  };

  for (const odd of [1, 7, 55, 93, 1001]) {
    assert.equal(firesWithin60Ticks(odd), false, `odd total ${odd} never recorded anything`);
  }
  for (const even of [0, 30, 90, 100]) {
    assert.equal(firesWithin60Ticks(even), true, `even total ${even} did fire`);
  }

  // And when it did fire, it claimed 30 seconds no matter how many had passed.
  // 60 seconds of play produced one upload of 30 — half the time, gone.
  let ref = 0;
  let uploads = 0;
  for (let tick = 0; tick < 15; tick++) {
    ref += 4;
    if (ref % 30 === 0) uploads += 30;
  }
  assert.equal(ref, 60, 'a minute of play');
  assert.equal(uploads, 30, 'but only half of it was ever recorded');
});

test('a 32-second session is recorded in full', () => {
  const meter = makeMeter();
  for (let index = 0; index < 8; index++) meter.tick(4); // 32s
  meter.flush(); // closing the game
  assert.equal(meter.saved, 32);
  assert.equal(meter.pending, 0);
});

test('a short session is still saved when the game is closed', () => {
  const meter = makeMeter();
  meter.tick(4);
  meter.tick(4); // 8 seconds, well under the threshold
  assert.equal(meter.uploads.length, 0, 'no upload while under the threshold');
  meter.flush();
  assert.equal(meter.saved, 8, 'the tail is not thrown away');
});

test('long play is uploaded in bounded chunks, not one huge number', () => {
  const meter = makeMeter();
  for (let index = 0; index < 300; index++) meter.tick(4); // 20 minutes
  assert.ok(meter.uploads.length > 10, 'it uploads periodically');
  for (const size of meter.uploads) assert.ok(size <= 34, `chunk ${size} stays small`);
  meter.flush();
  assert.equal(meter.saved, 1200, 'every second is accounted for');
});

test('a failed upload is retried rather than lost', () => {
  // Under the threshold, so no automatic flush happens: the only upload in this
  // test is the one we control.
  const meter = makeMeter();
  for (let index = 0; index < 5; index++) meter.tick(4); // 20 s pending
  assert.equal(meter.uploads.length, 0, 'nothing has been sent yet');

  const failed = meter.flush(false);
  assert.equal(failed, 20, 'the whole pending total was attempted');
  assert.equal(meter.saved, 0, 'a failed write saves nothing');
  assert.equal(meter.pending, 20, 'and the seconds stay pending');

  // The next successful flush re-sends the same seconds rather than a partial.
  const retried = meter.flush(true);
  assert.equal(retried, 20, 'the retry is the full outstanding amount');
  assert.equal(meter.saved, 20, 'nothing was dropped by the failure');
  assert.equal(meter.pending, 0);
});

test('a hidden tab does not accrue time', () => {
  // The component refuses to tick while `document.visibilityState` is hidden;
  // this is the contract that keeps a backgrounded tab from inflating playtime.
  const meter = makeMeter();
  const tickIfVisible = (visible: boolean) => { if (visible) meter.tick(4); };
  for (let index = 0; index < 20; index++) tickIfVisible(index < 5);
  meter.flush();
  assert.equal(meter.saved, 20);
});
