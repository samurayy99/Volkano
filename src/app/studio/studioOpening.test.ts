import assert from "node:assert/strict";
import { test } from "node:test";
import { mapStudioOpening } from "./studioOpening.ts";

test("hero opening follows the authored local score", () => {
  assert.deepEqual(mapStudioOpening("hero", 0), {
    tension: 0, aperture: 0, camera: 0, heroExit: 0, principleEntry: 0,
  });
  assert.equal(mapStudioOpening("hero", 0.2).tension, 0);
  assert.equal(mapStudioOpening("hero", 0.2).aperture, 0);
  assert.equal(mapStudioOpening("hero", 0.88).aperture, 1);
  assert.equal(mapStudioOpening("hero", 1).heroExit, 1);
});

test("principle lands while the aperture remains open", () => {
  assert.equal(mapStudioOpening("principle", 0).aperture, 1);
  assert.equal(mapStudioOpening("principle", 0).principleEntry, 0);
  assert.equal(mapStudioOpening("principle", 0.14).principleEntry, 1);
  assert.deepEqual(mapStudioOpening("capabilities", 0.5), {
    tension: 0, aperture: 1, camera: 1, heroExit: 1, principleEntry: 1,
  });
});

test("opening mapping clamps input and is deterministic in reverse", () => {
  assert.deepEqual(mapStudioOpening("hero", -4), mapStudioOpening("hero", 0));
  assert.deepEqual(mapStudioOpening("hero", 8), mapStudioOpening("hero", 1));
  const forward = mapStudioOpening("hero", 0.63);
  mapStudioOpening("hero", 0.9);
  assert.deepEqual(mapStudioOpening("hero", 0.63), forward);
});

test("reduced motion keeps every engine opening channel constant", () => {
  for (const chapter of ["hero", "principle", "capabilities", "lenox", "contact"] as const) {
    for (const local of [0, 0.17, 0.5, 1]) {
      const score = mapStudioOpening(chapter, local, true);
      assert.deepEqual(
        { tension: score.tension, aperture: score.aperture, camera: score.camera },
        { tension: 0, aperture: 0, camera: 0 },
      );
    }
  }
});
