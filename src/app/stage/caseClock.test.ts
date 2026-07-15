import assert from "node:assert/strict";
import { test } from "node:test";
import { createCaseClock } from "./caseClock.ts";
import type { ResolvedBeat } from "./cases.ts";

/**
 * The clock's contract, exercised against real gsap time (gsap ticks headless
 * in Node via its setTimeout fallback). The one fact that matters most:
 * `stop()` reports whether a run was still on the clock, because that answer
 * is what stands between a region change and Lenox frozen mid-`acting`.
 */

const beat = (at: number, request?: string): ResolvedBeat =>
  request === undefined ? { at } : { at, request };

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("beats apply in order and completion fires once", async () => {
  const clock = createCaseClock();
  const seen: string[] = [];
  let completions = 0;

  clock.start({
    beats: [beat(0, "a"), beat(0.05, "b"), beat(0.1, "c")],
    onBeat: (b) => seen.push(b.request ?? "?"),
    onComplete: () => (completions += 1),
    // The reduced-motion path is the same clock at a different rate.
    timeScale: 4,
  });

  await tick(400);
  assert.deepEqual(seen, ["a", "b", "c"]);
  assert.equal(completions, 1);
  // A finished run is no longer on the clock — stopping it releases nothing.
  assert.equal(clock.stop(), false);
});

test("stop mid-run reports the run was active", async () => {
  const clock = createCaseClock();
  const seen: string[] = [];

  clock.start({
    beats: [beat(0, "first"), beat(5, "never")],
    onBeat: (b) => seen.push(b.request ?? "?"),
    onComplete: () => assert.fail("a killed run must not complete"),
  });

  await tick(120); // let the clock actually tick
  assert.equal(clock.stop(), true, "an interrupted run must demand a release");
  assert.deepEqual(seen, ["first"]);

  await tick(150);
  assert.deepEqual(seen, ["first"], "no beat may fire after the kill");
});

test("stop before any run reports nothing to release", () => {
  assert.equal(createCaseClock().stop(), false);
});

test("restart kills the previous run silently", async () => {
  const clock = createCaseClock();
  const seen: string[] = [];

  clock.start({
    beats: [beat(5, "old")],
    onBeat: (b) => seen.push(b.request ?? "?"),
    onComplete: () => assert.fail("the replaced run must not complete"),
  });
  clock.start({
    beats: [beat(0, "new")],
    onBeat: (b) => seen.push(b.request ?? "?"),
    onComplete: () => {},
    timeScale: 4,
  });

  await tick(300);
  assert.deepEqual(seen, ["new"], "only the new run's beats may fire");
});
