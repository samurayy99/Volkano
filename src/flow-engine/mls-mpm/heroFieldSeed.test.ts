import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildHeroFieldSeed,
  assignHeroFieldCohort,
  HERO_FIELD_SEED,
  fitHeroFieldSeedToViewport,
  heroFieldVoidMetric,
  resolveHeroFieldCompositionMode,
  resolveHeroFieldLayout,
} from "./heroFieldSeed.js";

const LANDSCAPE_COUNT = 16_384;
const PORTRAIT_COUNT = 8_192;
const SAFE_MIN = 5;
const SAFE_MAX = 59;

test("hero-field seed: landscape and portrait have separate authored distributions", () => {
  // Portrait must never be a simple crop of landscape: different centers and radii.
  const land = HERO_FIELD_SEED.landscape;
  const port = HERO_FIELD_SEED.portrait;
  assert.notDeepEqual(land.cohorts.A.center, port.cohorts.A.center);
  assert.notDeepEqual(land.cohorts.A.radii, port.cohorts.A.radii);
  assert.notDeepEqual(land.cohorts.B.center, port.cohorts.B.center);
  assert.notDeepEqual(land.void, port.void);
});

test("hero-field seed: composition mode maps to layout (banded = portrait)", () => {
  assert.equal(resolveHeroFieldLayout("banded"), "portrait");
  assert.equal(resolveHeroFieldLayout("side"), "landscape");
  assert.equal(resolveHeroFieldLayout("unknown"), "landscape");
});

test("hero-field seed: viewport orientation resolves before allocation", () => {
  assert.equal(resolveHeroFieldCompositionMode(1920, 1080), "side");
  assert.equal(resolveHeroFieldCompositionMode(390, 844), "banded");
});

test("hero-field seed: authored mass fits the live viewport envelope", () => {
  const { positions } = buildHeroFieldSeed(LANDSCAPE_COUNT, "landscape");
  const originalZ = positions.filter((_, index) => index % 3 === 2);
  fitHeroFieldSeedToViewport(positions, {
    min: [10, 8],
    max: [54, 58],
    inset: [1, 2],
    fill: 0.86,
  });

  const fittedZ = positions.filter((_, index) => index % 3 === 2);
  assert.deepEqual(fittedZ, originalZ, "viewport fit must preserve authored depth");
  for (let i = 0; i < positions.length; i += 3) {
    assert.ok(positions[i] > 10 && positions[i] < 54, `x ${positions[i]}`);
    assert.ok(positions[i + 1] > 8 && positions[i + 1] < 58, `y ${positions[i + 1]}`);
  }
});

test("hero-field seed: deterministic — same input yields identical world", () => {
  const a = buildHeroFieldSeed(LANDSCAPE_COUNT, "landscape");
  const b = buildHeroFieldSeed(LANDSCAPE_COUNT, "landscape");
  assert.deepEqual(a.positions, b.positions);
  assert.deepEqual(a.velocities, b.velocities);

  const pa = buildHeroFieldSeed(PORTRAIT_COUNT, "portrait");
  const pb = buildHeroFieldSeed(PORTRAIT_COUNT, "portrait");
  assert.deepEqual(pa.positions, pb.positions);
  assert.deepEqual(pa.velocities, pb.velocities);
});

test("hero-field seed: every position respects safe bounds and floor", () => {
  for (const [count, layout] of [
    [LANDSCAPE_COUNT, "landscape"],
    [PORTRAIT_COUNT, "portrait"],
  ]) {
    const { positions } = buildHeroFieldSeed(count, layout);
    const floorY = HERO_FIELD_SEED[layout].floorY;
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3 + 0];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z),
        `layout ${layout} particle ${i} must be finite`);
      assert.ok(x >= SAFE_MIN && x <= SAFE_MAX, `layout ${layout} x out of safe range: ${x}`);
      assert.ok(y >= SAFE_MIN && y <= SAFE_MAX, `layout ${layout} y out of safe range: ${y}`);
      assert.ok(z >= SAFE_MIN && z <= SAFE_MAX, `layout ${layout} z out of safe range: ${z}`);
      // The authored floor is the only lower exclusion: nothing below it.
      assert.ok(y >= floorY, `layout ${layout} particle ${i} below floor ${floorY}: ${y}`);
    }
  }
});

test("hero-field seed: no particle authored inside the stay-out void", () => {
  for (const [count, layout] of [
    [LANDSCAPE_COUNT, "landscape"],
    [PORTRAIT_COUNT, "portrait"],
  ]) {
    const { positions } = buildHeroFieldSeed(count, layout);
    const v = HERO_FIELD_SEED[layout].void;
    let inside = 0;
    let boundaryPileup = 0;
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3 + 0];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      const metric = heroFieldVoidMetric(x, y, z, v);
      if (metric < 1) inside++;
      if (metric >= 1 && metric < 1.005) boundaryPileup++;
    }
    // Rejection keeps the void empty without projecting a visible particle wall.
    assert.equal(inside, 0, `layout ${layout}: ${inside} particles inside void`);
    assert.ok(
      boundaryPileup / count < 0.002,
      `layout ${layout}: ${boundaryPileup} particles piled on the void boundary`,
    );
  }
});

test("hero-field seed: the void bends through depth instead of forming an AABB", () => {
  for (const layout of ["landscape", "portrait"]) {
    const v = HERO_FIELD_SEED[layout].void;
    const z = v.center[2] + v.radii[2] * 0.65;
    const curvedX = v.center[0] + Math.sin(0.65 * 1.18) * v.bendX;
    const straightMetric = heroFieldVoidMetric(v.center[0], v.center[1], z, v);
    const curvedMetric = heroFieldVoidMetric(curvedX, v.center[1], z, v);
    assert.ok(curvedMetric < straightMetric, `${layout}: void centerline must curve through depth`);
  }
});

test("hero-field seed: primary mass is asymmetric, lifted and depth-weighted", () => {
  for (const [count, layout] of [
    [LANDSCAPE_COUNT, "landscape"],
    [PORTRAIT_COUNT, "portrait"],
  ]) {
    const { positions } = buildHeroFieldSeed(count, layout);
    const center = HERO_FIELD_SEED[layout].cohorts.A.center;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    for (let i = 0; i < count; i++) {
      if (assignHeroFieldCohort(i) !== "A") continue;
      for (let axis = 0; axis < 3; axis++) {
        const value = positions[i * 3 + axis];
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }

    const negativeX = center[0] - min[0];
    const positiveX = max[0] - center[0];
    const downward = center[1] - min[1];
    const upward = max[1] - center[1];
    const front = center[2] - min[2];
    const back = max[2] - center[2];

    assert.ok(positiveX > negativeX * 1.15, `${layout}: primary X silhouette is too symmetric`);
    assert.ok(upward > downward * 1.15, `${layout}: primary mass does not thin downward`);
    assert.ok(front > back * 1.08, `${layout}: primary depth has no front/back weighting`);
  }
});

test("hero-field seed: cohort balance is ~55 / 22 / 15 / 8", () => {
  for (const count of [LANDSCAPE_COUNT, PORTRAIT_COUNT]) {
    const counts = { A: 0, B: 0, C: 0, D: 0 };
    for (let i = 0; i < count; i++) counts[assignHeroFieldCohort(i)]++;
    const pct = (c) => counts[c] / count;
    assert.ok(Math.abs(pct("A") - 0.55) < 0.02, `A ${pct("A")}`);
    assert.ok(Math.abs(pct("B") - 0.22) < 0.02, `B ${pct("B")}`);
    assert.ok(Math.abs(pct("C") - 0.15) < 0.02, `C ${pct("C")}`);
    assert.ok(Math.abs(pct("D") - 0.08) < 0.02, `D ${pct("D")}`);
  }
});

test("hero-field seed: initial velocity is subtle and deterministic", () => {
  const { velocities } = buildHeroFieldSeed(LANDSCAPE_COUNT, "landscape");
  let maxSpeed = 0;
  for (let i = 0; i < LANDSCAPE_COUNT; i++) {
    const vx = velocities[i * 3 + 0];
    const vy = velocities[i * 3 + 1];
    const vz = velocities[i * 3 + 2];
    const speed = Math.hypot(vx, vy, vz);
    maxSpeed = Math.max(maxSpeed, speed);
    assert.ok(Number.isFinite(speed));
  }
  // Cohort drift + 0.02 jitter must stay far below animation-like speeds.
  assert.ok(maxSpeed < 0.5, `max speed too high: ${maxSpeed}`);
});

test("hero-field seed: reachable only at hero boot and hero layout changes", () => {
  const bridgePath = fileURLToPath(new URL("../engineBridge.ts", import.meta.url));
  const src = readFileSync(bridgePath, "utf8");
  const callCount = src.match(/\.seedHeroFieldPopulation\?\.\(/g)?.length ?? 0;
  const branch = src.match(
    /if \(this\.isHeroField\) \{([\s\S]*?)\n    \} else if \(!this\.isLivingSurface\) \{/,
  );

  assert.equal(
    callCount,
    2,
    "engineBridge must seed only at hero boot and after a hero layout change",
  );
  assert.ok(branch, "engineBridge must isolate the hero seed from the legacy path");
  assert.ok(
    branch[1].includes("seedHeroFieldPopulation") &&
      branch[1].includes("resolveHeroFieldLayout(this.pendingCompositionMode)"),
    "hero-field branch must call the seed through the tested layout resolver",
  );
  assert.match(
    src,
    /if \(heroLayoutChanged\) \{\s*this\.app\.seedHeroFieldPopulation\?\.\(resolveHeroFieldLayout\(heroMode\)\);\s*\}/,
    "orientation reseeding must stay guarded by the hero-only layout change",
  );
});
