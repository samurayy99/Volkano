import assert from "node:assert/strict";
import { test } from "node:test";
import { mapStudioOpening } from "./studioOpening.ts";

test("hero copy exits on the same interval as the first object transport", () => {
  const start = mapStudioOpening("hero", 0);
  const end = mapStudioOpening("hero", 1);

  assert.equal(start.tension, 0);
  assert.equal(start.aperture, 0);
  assert.equal(start.camera, 0);
  assert.equal(start.heroExit, 0);
  assert.equal(end.tension, 0);
  assert.equal(end.aperture, 0);
  assert.equal(end.heroExit, 1);
  assert.equal(mapStudioOpening("hero", 0.29).heroExit, 0);
  assert.ok(mapStudioOpening("hero", 0.5).heroExit > 0);
  assert.equal(mapStudioOpening("hero", 0.72).heroExit, 1);
});

test("principle lands through DOM and camera without solver aperture", () => {
  const start = mapStudioOpening("principle", 0);
  const end = mapStudioOpening("principle", 1);

  assert.equal(start.aperture, 0);
  assert.equal(start.principleEntry, 0);
  assert.equal(mapStudioOpening("principle", 0.04).principleEntry, 0);
  assert.equal(mapStudioOpening("principle", 0.18).principleEntry, 1);
  assert.equal(end.tension, 0);
  assert.equal(end.aperture, 0);
});

test("mapping clamps input and is deterministic in reverse", () => {
  assert.deepEqual(mapStudioOpening("hero", -4), mapStudioOpening("hero", 0));
  assert.deepEqual(mapStudioOpening("hero", 8), mapStudioOpening("hero", 1));
  const forward = mapStudioOpening("capabilities", 0.63);
  mapStudioOpening("contact", 0.9);
  assert.deepEqual(mapStudioOpening("capabilities", 0.63), forward);
});

test("reduced motion holds a static coherent composition", () => {
  for (const chapter of ["hero", "principle", "capabilities", "lenox", "contact"] as const) {
    for (const local of [0, 0.17, 0.5, 1]) {
      const score = mapStudioOpening(chapter, local, true);
      assert.deepEqual(
        {
          tension: score.tension,
          aperture: score.aperture,
          camera: score.camera,
        },
        {
          tension: 0,
          aperture: 0,
          camera: 0,
        },
      );
    }
  }
});
