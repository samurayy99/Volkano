import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALERTNESS_DECAY,
  ALERTNESS_RISE,
  PHASES,
  RESPONSE,
  approach,
  initialParams,
  stepToward,
} from "./phases.ts";

test("every phase declares every parameter the response table knows", () => {
  const keys = Object.keys(RESPONSE).sort();
  for (const phase of Object.values(PHASES)) {
    assert.deepEqual(Object.keys(phase).sort(), keys);
  }
});

test("the three phases are actually different, not relabelled copies", () => {
  assert.notEqual(PHASES.ambient.targetInfluence, PHASES.lenox.targetInfluence);
  // The proof stands or falls on this one: LENOX must pull an order of
  // magnitude harder than ambient or the states will not read as different.
  assert.ok(PHASES.lenox.targetInfluence > PHASES.ambient.targetInfluence * 10);
  assert.ok(PHASES.attention.anchorDrift > PHASES.ambient.anchorDrift);
});

test("ambient keeps matter free — it must not read as a pulled shape", () => {
  assert.ok(PHASES.ambient.targetInfluence < 0.1);
});

test("approach is frame-rate independent", () => {
  const oneStep = approach(0, 1, 2, 1 / 60);
  let twoHalfSteps = 0;
  twoHalfSteps = approach(twoHalfSteps, 1, 2, 1 / 120);
  twoHalfSteps = approach(twoHalfSteps, 1, 2, 1 / 120);
  assert.ok(Math.abs(oneStep - twoHalfSteps) < 1e-12);
});

test("parameters move at their own rates, not one global lerp", () => {
  const rates = new Set(Object.values(RESPONSE));
  assert.ok(rates.size > 1);
  // Attraction must arrive sooner than the material body settles.
  assert.ok(RESPONSE.targetInfluence > RESPONSE.noise);
});

test("alertness rises faster than it decays", () => {
  assert.ok(ALERTNESS_RISE > ALERTNESS_DECAY * 4);
});

test("stepping toward a phase converges to it and never overshoots", () => {
  let p = initialParams();
  for (let i = 0; i < 600; i++) p = stepToward(p, "lenox", 1 / 60);
  assert.ok(Math.abs(p.targetInfluence - PHASES.lenox.targetInfluence) < 1e-6);
  assert.ok(p.targetInfluence <= PHASES.lenox.targetInfluence + 1e-9);
});
