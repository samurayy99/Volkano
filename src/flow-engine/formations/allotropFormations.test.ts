import assert from "node:assert/strict";
import { test } from "node:test";
import type { FormationId } from "../types.ts";
import {
  ALLOTROP_FORMATION_IDS,
  FORMATION_PAIR_FLOATS,
  FORMATION_PAIR_OFFSETS,
  FORMATION_PAIR_STRIDE_BYTES,
  buildAllotropFormation,
  MATTER_CORRIDORS,
  corridorForFormation,
  formationPlacement,
  getBrilliantFacetCount,
  getFormationGraphiteWeight,
  getFullereneEdgeCount,
  nlerpFormationQuaternions,
  packFormationPair,
  screenPercentForNormalisedX,
  validatePackedFormationPair,
} from "./allotropFormations.ts";
import { buildDesign01SculptureFormation } from "./design01SculptureFormations.ts";
import {
  matchFormationTargetByGroup,
  spatiallyMatchFormationTarget,
} from "./design01FormationTransport.ts";

const bounds = {
  min: [3, 3, 3] as [number, number, number],
  max: [61, 61, 61] as [number, number, number],
};

const ids: readonly FormationId[] = ALLOTROP_FORMATION_IDS;

test("every ALLOTROP formation is deterministic, finite and complete", () => {
  for (const id of ids) {
    const first = buildAllotropFormation(id, bounds, 768, "side");
    const second = buildAllotropFormation(id, bounds, 768, "side");
    assert.deepEqual(first, second, id);
    assert.equal(first.positions.length, 768 * 3, id);
    assert.equal(first.rotations.length, 768 * 4, id);
    assert.equal(first.sizeScales.length, 768, id);
    assert.equal(first.interactionBudgets.length, 768, id);
    assert.equal(first.groups.length, 768, id);
    for (const value of first.positions) {
      assert.equal(Number.isFinite(value), true, id);
      assert.ok(value >= 3 + 58 * 0.08 - 1e-5, id);
      assert.ok(value <= 61 - 58 * 0.08 + 1e-5, id);
    }
    for (let index = 0; index < 768; index++) {
      const rotation = first.rotations.slice(index * 4, index * 4 + 4);
      assert.ok(Math.abs(Math.hypot(...rotation) - 1) < 1e-5, id);
      assert.ok(first.sizeScales[index] > 0, id);
      assert.ok(first.interactionBudgets[index] > 0, id);
      assert.ok(first.groups[index] <= 2, id);
    }
  }
});

test("desktop triad keeps three coherent, non-overlapping slot cohorts", () => {
  const formation = buildAllotropFormation("principle.triad", bounds, 900, "side");
  const counts = [0, 0, 0];
  for (const group of formation.groups) counts[group] += 1;
  assert.deepEqual(counts, [306, 297, 297]);
  for (let index = 1; index < formation.groups.length; index++) {
    assert.ok(formation.groups[index] >= formation.groups[index - 1]);
  }
});

test("fullerene keeps a real central void", () => {
  const formation = buildAllotropFormation("principle.fullerene", bounds, 1200, "banded");
  const center = [32, 3 + 58 * 0.68, 32];
  let minimum = Infinity;
  for (let index = 0; index < formation.groups.length; index++) {
    minimum = Math.min(
      minimum,
      Math.hypot(
        formation.positions[index * 3] - center[0],
        formation.positions[index * 3 + 1] - center[1],
        formation.positions[index * 3 + 2] - center[2],
      ),
    );
  }
  assert.ok(minimum > 5);
  assert.equal(getFullereneEdgeCount(), 90);
});

test("packed pair uses one stable 96-byte struct per slot", () => {
  const from = buildAllotropFormation("source.graphiteClosed", bounds, 512, "side");
  const to = buildAllotropFormation("principle.fullerene", bounds, 512, "side");
  const first = packFormationPair("source.graphiteClosed", "principle.fullerene", from, to);
  const second = packFormationPair("source.graphiteClosed", "principle.fullerene", from, to);
  assert.equal(first.count, 512);
  assert.equal(FORMATION_PAIR_STRIDE_BYTES, 96);
  assert.deepEqual(FORMATION_PAIR_OFFSETS, {
    fromPosition: 0,
    toPosition: 4,
    fromRotation: 8,
    toRotation: 12,
    route: 16,
    params: 20,
  });
  assert.equal(first.packed.length, 512 * FORMATION_PAIR_FLOATS);
  assert.deepEqual(first, second);
  assert.equal(first.packed.every(Number.isFinite), true);
  for (let index = 0; index < first.count; index++) {
    const base = index * FORMATION_PAIR_FLOATS;
    const dot = first.packed.slice(base + 8, base + 12).reduce(
      (sum, value, component) => sum + value * first.packed[base + 12 + component],
      0,
    );
    assert.ok(dot >= -1e-6);
    assert.ok(Math.abs(first.packed[base + 22] - 2.2) < 1e-6);
    assert.equal(first.packed[base + 23], 0);
  }
});

test("C60 to Continuum uses one spatially matched authored release seam", () => {
  const from = buildAllotropFormation("principle.fullerene", bounds, 512, "side");
  const rawTo = buildDesign01SculptureFormation(
    "principle.continuum",
    bounds,
    512,
    "side",
  );
  const to = spatiallyMatchFormationTarget(from, rawTo);
  const first = packFormationPair(
    "principle.fullerene",
    "principle.continuum",
    from,
    to,
    bounds,
  );
  const second = packFormationPair(
    "principle.fullerene",
    "principle.continuum",
    from,
    to,
    bounds,
  );
  assert.deepEqual(first, second);
  let minDelay = Infinity;
  let maxDelay = -Infinity;
  let moving = 0;
  for (let index = 0; index < first.count; index += 1) {
    const base = index * FORMATION_PAIR_FLOATS;
    minDelay = Math.min(minDelay, first.packed[base + 20]);
    maxDelay = Math.max(maxDelay, first.packed[base + 20]);
    moving += Number(first.packed[base + 21] > 0);
    assert.ok(first.packed[base + 21] <= 1.05 + 1e-6);
    assert.ok(Math.abs(first.packed[base + 19] - 0.25) < 1e-6);
  }
  assert.ok(maxDelay - minDelay > 0.75);
  assert.ok(moving > first.count * 0.95);
});

test("Continuum to TRI-AXIS uses three staged authored cohorts", () => {
  const from = buildDesign01SculptureFormation(
    "principle.continuum",
    bounds,
    1536,
    "side",
  );
  const rawTo = buildDesign01SculptureFormation(
    "capability.triaxis",
    bounds,
    1536,
    "side",
  );
  const to = matchFormationTargetByGroup(from, rawTo);
  const pair = packFormationPair(
    "principle.continuum",
    "capability.triaxis",
    from,
    to,
    bounds,
  );
  const delayRanges = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
  for (let index = 0; index < pair.count; index += 1) {
    const base = index * FORMATION_PAIR_FLOATS;
    const group = from.groups[index];
    delayRanges[group][0] = Math.min(delayRanges[group][0], pair.packed[base + 20]);
    delayRanges[group][1] = Math.max(delayRanges[group][1], pair.packed[base + 20]);
    assert.ok(pair.packed[base + 21] <= 0.88 + 1e-6);
    assert.ok(Math.abs(pair.packed[base + 19] - 0.45) < 1e-6);
    assert.equal(to.groups[index], group);
  }
  assert.ok(delayRanges[0][0] < delayRanges[1][0]);
  assert.ok(delayRanges[1][0] < delayRanges[2][0]);
  assert.ok(delayRanges[0][1] > delayRanges[1][0]);
  assert.ok(delayRanges[1][1] > delayRanges[2][0]);
  assert.ok(delayRanges[2][1] < 0.79);
});

test("TRI-AXIS to VECTOR LOOM uses two main-path cohorts and one delayed guide", () => {
  const from = buildDesign01SculptureFormation(
    "capability.triaxis",
    bounds,
    1536,
    "side",
  );
  const rawTo = buildDesign01SculptureFormation(
    "lenox.vectorLoom",
    bounds,
    1536,
    "side",
  );
  const to = matchFormationTargetByGroup(from, rawTo);
  const pair = packFormationPair(
    "capability.triaxis",
    "lenox.vectorLoom",
    from,
    to,
    bounds,
  );
  const delayRanges = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
  const maxAmplitudes = [0, 0, 0];
  for (let index = 0; index < pair.count; index += 1) {
    const base = index * FORMATION_PAIR_FLOATS;
    const group = from.groups[index];
    delayRanges[group][0] = Math.min(delayRanges[group][0], pair.packed[base + 20]);
    delayRanges[group][1] = Math.max(delayRanges[group][1], pair.packed[base + 20]);
    maxAmplitudes[group] = Math.max(maxAmplitudes[group], pair.packed[base + 21]);
    assert.ok(Math.abs(pair.packed[base + 19] - 0.65) < 1e-6);
    assert.equal(to.groups[index], group);
  }
  assert.ok(delayRanges[0][0] < 0.01);
  assert.ok(delayRanges[1][0] > delayRanges[0][0]);
  assert.ok(delayRanges[0][1] > delayRanges[1][0]);
  assert.ok(delayRanges[2][0] > delayRanges[1][1]);
  assert.ok(delayRanges[2][1] < 0.69);
  assert.ok(maxAmplitudes[0] <= 7.2 + 1e-6);
  assert.ok(maxAmplitudes[1] <= 7.2 + 1e-6);
  assert.ok(maxAmplitudes[2] <= 4.8 + 1e-6);
});

test("VECTOR LOOM to FORWARD VECTOR lets the guide establish direction first", () => {
  const from = buildDesign01SculptureFormation(
    "lenox.vectorLoom",
    bounds,
    1536,
    "side",
  );
  const rawTo = buildDesign01SculptureFormation(
    "contact.forwardVector",
    bounds,
    1536,
    "side",
  );
  const to = matchFormationTargetByGroup(from, rawTo);
  const pair = packFormationPair(
    "lenox.vectorLoom",
    "contact.forwardVector",
    from,
    to,
    bounds,
  );
  const delayRanges = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
  const maxAmplitudes = [0, 0, 0];
  for (let index = 0; index < pair.count; index += 1) {
    const base = index * FORMATION_PAIR_FLOATS;
    const group = from.groups[index];
    delayRanges[group][0] = Math.min(delayRanges[group][0], pair.packed[base + 20]);
    delayRanges[group][1] = Math.max(delayRanges[group][1], pair.packed[base + 20]);
    maxAmplitudes[group] = Math.max(maxAmplitudes[group], pair.packed[base + 21]);
    assert.ok(Math.abs(pair.packed[base + 19] - 0.75) < 1e-6);
    assert.equal(to.groups[index], group);
  }
  assert.ok(delayRanges[2][0] < delayRanges[0][0]);
  assert.ok(delayRanges[2][0] < delayRanges[1][0]);
  assert.ok(delayRanges[0][0] >= 0.18 - 1e-6);
  assert.ok(delayRanges[1][0] >= 0.26 - 1e-6);
  assert.ok(delayRanges[2][1] < 0.3);
  assert.ok(delayRanges[0][1] < 0.72);
  assert.ok(delayRanges[1][1] < 0.8);
  assert.ok(maxAmplitudes[0] <= 3.2 + 1e-6);
  assert.ok(maxAmplitudes[1] <= 3.2 + 1e-6);
  assert.ok(maxAmplitudes[2] <= 1.9 + 1e-6);
});

test("C60 to graphite uses one restrained layer-staged route", () => {
  const from = buildAllotropFormation("principle.fullerene", bounds, 512, "side");
  const to = buildAllotropFormation("source.graphiteClosed", bounds, 512, "side");
  const pair = packFormationPair(
    "principle.fullerene",
    "source.graphiteClosed",
    from,
    to,
    bounds,
  );
  let minDelay = Infinity;
  let maxDelay = -Infinity;
  for (let index = 0; index < pair.count; index += 1) {
    const base = index * FORMATION_PAIR_FLOATS;
    minDelay = Math.min(minDelay, pair.packed[base + 20]);
    maxDelay = Math.max(maxDelay, pair.packed[base + 20]);
    assert.ok(pair.packed[base + 21] <= 0.78 + 1e-6);
    assert.ok(Math.abs(pair.packed[base + 19] - 0.55) < 1e-6);
  }
  assert.ok(maxDelay - minDelay > 0.7);
});

test("packed pair rejects an invalid fixed-stride payload", () => {
  assert.throws(
    () => validatePackedFormationPair(new Float32Array(FORMATION_PAIR_FLOATS - 1), 1),
    /96-byte stride/,
  );
});

test("packed pair validation rejects invalid metadata before upload", () => {
  const from = buildAllotropFormation("source.graphiteClosed", bounds, 8, "side");
  const pair = packFormationPair("source.graphiteClosed", "source.graphiteClosed", from, from);
  const invalidQuaternion = pair.packed.slice();
  invalidQuaternion.fill(0, 8, 12);
  assert.throws(
    () => validatePackedFormationPair(invalidQuaternion, pair.count),
    /quaternion is not normalized/,
  );
  const invalidReserved = pair.packed.slice();
  invalidReserved[23] = 1;
  assert.throws(
    () => validatePackedFormationPair(invalidReserved, pair.count),
    /reserved field is not zero/,
  );
});

test("hemisphere-corrected nlerp has exact finite endpoints", () => {
  const from = [0, 0, 0, 1] as [number, number, number, number];
  const sameHemisphere = [0, 0, 0, -1] as [number, number, number, number];
  assert.deepEqual(nlerpFormationQuaternions(from, sameHemisphere, 0), from);
  assert.deepEqual(nlerpFormationQuaternions(from, sameHemisphere, 1), from);
  const halfway = nlerpFormationQuaternions(from, [1, 0, 0, 0], 0.5);
  assert.equal(halfway.every(Number.isFinite), true);
  assert.ok(Math.abs(Math.hypot(...halfway) - 1) < 1e-7);
  assert.deepEqual(
    nlerpFormationQuaternions([0, 0, 0, 0], [Number.NaN, 0, 0, 0], 0.5),
    from,
  );
});

test("graphite uses nine separated layers without duplicate centres", () => {
  const formation = buildAllotropFormation("source.graphiteClosed", bounds, 729, "side");
  const layers = new Set<number>();
  const positions = new Set<string>();
  for (let index = 0; index < formation.groups.length; index++) {
    const x = formation.positions[index * 3];
    const y = formation.positions[index * 3 + 1];
    const z = formation.positions[index * 3 + 2];
    layers.add(Math.round(y * 1e5));
    const key = [x, y, z].map((value) => Math.round(value * 1e5)).join(":");
    assert.equal(positions.has(key), false, key);
    positions.add(key);
  }
  assert.equal(layers.size, 9);
});

test("C60 positions are unique and use the protected interaction budget", () => {
  const formation = buildAllotropFormation("principle.fullerene", bounds, 900, "side");
  const positions = new Set<string>();
  for (let index = 0; index < formation.groups.length; index++) {
    const key = [
      formation.positions[index * 3],
      formation.positions[index * 3 + 1],
      formation.positions[index * 3 + 2],
    ].map((value) => Math.round(value * 1e5)).join(":");
    assert.equal(positions.has(key), false, key);
    positions.add(key);
    assert.ok(Math.abs(formation.sizeScales[index] - 0.38) < 1e-6);
    assert.ok(Math.abs(formation.interactionBudgets[index] - 0.9) < 1e-6);
  }
});

test("the procedural contact target declares the standard 57-facet story", () => {
  assert.equal(getBrilliantFacetCount(), 57);
});

test("formation material metadata lives with the formation registry", () => {
  assert.equal(getFormationGraphiteWeight("source.graphiteClosed"), 1);
  assert.equal(getFormationGraphiteWeight("principle.graphite"), 0.76);
  assert.equal(getFormationGraphiteWeight("contact.brilliant"), 0);
});

/*
 * The regression that survived two video rejections: matter lying on the copy
 * while the CSS corridor was provably correct. Nothing enforced the corridor,
 * so nothing caught it. This checks the positions that actually reach the GPU,
 * under every corridor a formation can be shown in — not the authored numbers,
 * which the builder is now allowed to refit.
 */
test("no formation can leave its chapter corridor, whatever it is shown under", () => {
  const span = 58;
  for (const id of ALLOTROP_FORMATION_IDS) {
    for (const [name, corridor] of Object.entries(MATTER_CORRIDORS)) {
      const bank = buildAllotropFormation(id, bounds, 512, "side", corridor);
      let minX = Infinity;
      let maxX = -Infinity;
      for (let index = 0; index < bank.groups.length; index++) {
        const x = (bank.positions[index * 3] - bounds.min[0]) / span;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      assert.ok(
        minX >= corridor.minX - 1e-6,
        `${id} under "${name}" reaches ${screenPercentForNormalisedX(minX).toFixed(1)}%, past its corridor`,
      );
      assert.ok(
        maxX <= corridor.maxX + 1e-6,
        `${id} under "${name}" starts at ${screenPercentForNormalisedX(maxX).toFixed(1)}%, before its corridor`,
      );
    }
  }
});

test("corridors are inside the viewport and the safe simulation band", () => {
  for (const corridor of Object.values(MATTER_CORRIDORS)) {
    assert.ok(corridor.minX >= 0.08 && corridor.maxX <= 0.92);
    assert.ok(corridor.maxX > corridor.minX);
    assert.ok(screenPercentForNormalisedX(corridor.maxX) >= 0);
    assert.ok(screenPercentForNormalisedX(corridor.minX) <= 100);
  }
});

test("a formation refit into a narrow corridor keeps its proportions", () => {
  const wide = buildAllotropFormation("principle.fullerene", bounds, 512, "side", MATTER_CORRIDORS.wide);
  const narrow = buildAllotropFormation("principle.fullerene", bounds, 512, "side", MATTER_CORRIDORS.narrow);
  const extent = (bank: typeof wide) => {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let index = 0; index < bank.groups.length; index++) {
      for (let axis = 0; axis < 3; axis++) {
        const value = bank.positions[index * 3 + axis];
        if (value < lo[axis]) lo[axis] = value;
        if (value > hi[axis]) hi[axis] = value;
      }
    }
    return hi.map((value, axis) => value - lo[axis]);
  };
  const a = extent(wide);
  const b = extent(narrow);
  // Same body, uniformly smaller: every axis shrinks by the same factor.
  const ratio = b[0] / a[0];
  assert.ok(ratio < 1, "the narrow corridor must actually shrink the body");
  for (let axis = 1; axis < 3; axis++) {
    assert.ok(
      Math.abs(b[axis] / a[axis] - ratio) < 0.02,
      `axis ${axis} scaled by ${(b[axis] / a[axis]).toFixed(3)} instead of ${ratio.toFixed(3)}`,
    );
  }
});
