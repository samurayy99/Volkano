import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DESIGN01_SCULPTURE_IDS,
  buildDesign01SculptureFormation,
  isDesign01SculptureId,
} from "./design01SculptureFormations.ts";

const bounds = {
  min: [3, 3, 3] as [number, number, number],
  max: [61, 61, 61] as [number, number, number],
};

const extents = (positions: Float32Array) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[index + axis]);
      max[axis] = Math.max(max[axis], positions[index + axis]);
    }
  }
  return { min, max, span: min.map((value, axis) => max[axis] - value) };
};
test("every Gate-3 sculpture is deterministic, complete and finite", () => {
  for (const id of DESIGN01_SCULPTURE_IDS) {
    const first = buildDesign01SculptureFormation(id, bounds, 1200, "side");
    const second = buildDesign01SculptureFormation(id, bounds, 1200, "side");
    assert.deepEqual(first, second, id);
    assert.equal(first.positions.length, 1200 * 3, id);
    assert.equal(first.rotations.length, 1200 * 4, id);
    assert.equal(first.sizeScales.length, 1200, id);
    assert.equal(first.interactionBudgets.length, 1200, id);
    assert.equal(first.groups.length, 1200, id);
    assert.equal(first.positions.every(Number.isFinite), true, id);
    assert.equal(first.rotations.every(Number.isFinite), true, id);
    for (let index = 0; index < 1200; index += 1) {
      const rotation = first.rotations.slice(index * 4, index * 4 + 4);
      assert.ok(Math.abs(Math.hypot(...rotation) - 1) < 1e-5, id);
      assert.ok(first.sizeScales[index] > 0, id);
      assert.ok(first.interactionBudgets[index] > 0, id);
    }
  }
});
test("the four subjects keep distinct spatial and grouping signatures", () => {
  const signatures = DESIGN01_SCULPTURE_IDS.map((id) => {
    const bank = buildDesign01SculptureFormation(id, bounds, 960, "side");
    const box = extents(bank.positions);
    return {
      id,
      span: box.span.map((value) => Math.round(value * 100) / 100),
      groups: [...new Set(bank.groups)],
    };
  });
  assert.equal(new Set(signatures.map((item) => item.span.join(":"))).size, 4);
  assert.deepEqual(signatures.map((item) => item.groups.length), [3, 3, 3, 3]);
});

test("Continuum and TRI-AXIS expose three equal transport cohorts", () => {
  for (const id of ["principle.continuum", "capability.triaxis"] as const) {
    const bank = buildDesign01SculptureFormation(id, bounds, 4096, "side");
    const counts = [0, 0, 0];
    for (const group of bank.groups) counts[group] += 1;
    assert.deepEqual(counts, [1366, 1365, 1365], id);
  }
});

test("TRI-AXIS and VECTOR LOOM expose three equal transport cohorts", () => {
  for (const id of ["capability.triaxis", "lenox.vectorLoom"] as const) {
    const bank = buildDesign01SculptureFormation(id, bounds, 4096, "side");
    const counts = [0, 0, 0];
    for (const group of bank.groups) counts[group] += 1;
    assert.deepEqual(counts, [1366, 1365, 1365], id);
  }
});

test("VECTOR LOOM and FORWARD VECTOR preserve three semantic transport cohorts", () => {
  for (const id of ["lenox.vectorLoom", "contact.forwardVector"] as const) {
    const bank = buildDesign01SculptureFormation(id, bounds, 4096, "side");
    const counts = [0, 0, 0];
    for (const group of bank.groups) counts[group] += 1;
    assert.deepEqual(counts, [1366, 1365, 1365], id);
  }
});

test("desktop and banded placements stay inside the safe simulation interior", () => {
  for (const id of DESIGN01_SCULPTURE_IDS) {
    for (const mode of ["side", "banded"] as const) {
      const bank = buildDesign01SculptureFormation(id, bounds, 768, mode);
      const box = extents(bank.positions);
      for (let axis = 0; axis < 3; axis += 1) {
        assert.ok(box.min[axis] >= bounds.min[axis] + 58 * 0.059, `${id}:${mode}`);
        assert.ok(box.max[axis] <= bounds.max[axis] - 58 * 0.059, `${id}:${mode}`);
      }
    }
  }
});
test("sculpture type guard accepts only the new authored targets", () => {
  for (const id of DESIGN01_SCULPTURE_IDS) assert.equal(isDesign01SculptureId(id), true);
  assert.equal(isDesign01SculptureId("source.graphiteClosed"), false);
  assert.equal(isDesign01SculptureId("principle.fullerene"), false);
});

test("zero particles returns a valid empty bank", () => {
  const bank = buildDesign01SculptureFormation(
    "principle.continuum",
    bounds,
    0,
    "side",
  );
  assert.equal(bank.positions.length, 0);
  assert.equal(bank.rotations.length, 0);
  assert.equal(bank.sizeScales.length, 0);
  assert.equal(bank.interactionBudgets.length, 0);
  assert.equal(bank.groups.length, 0);
});
