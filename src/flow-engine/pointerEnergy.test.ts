import assert from "node:assert/strict";
import { test } from "node:test";
import {
  POINTER_ENERGY_RELEASE_SECONDS,
  advancePointerEnergy,
} from "./pointerEnergy.ts";

test("pointer energy remains active through decay and reaches exact neutral", () => {
  let energy = 1;
  let elapsed = 0;
  while (elapsed + 1 / 60 < POINTER_ENERGY_RELEASE_SECONDS) {
    energy = advancePointerEnergy(energy, 0, 1 / 60);
    elapsed += 1 / 60;
    assert.ok(energy > 0);
  }
  energy = advancePointerEnergy(energy, 0, 1 / 60);
  assert.equal(energy, 0);
  assert.equal(advancePointerEnergy(energy, 0, 1 / 60), 0);
});

test("pointer energy rise is bounded and frame-rate independent", () => {
  const oneStep = advancePointerEnergy(0, 1, 1 / 30);
  const twoSteps = advancePointerEnergy(
    advancePointerEnergy(0, 1, 1 / 60),
    1,
    1 / 60,
  );
  assert.ok(Math.abs(oneStep - twoSteps) < 1e-12);
  assert.ok(oneStep > 0 && oneStep < 1);
});
