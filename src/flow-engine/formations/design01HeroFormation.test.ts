import assert from "node:assert/strict";
import test from "node:test";
import { buildDesign01HeroFormation } from "./design01HeroFormation.ts";

const bounds = {
  min: [3, 10, 3] as [number, number, number],
  max: [53, 61, 61] as [number, number, number],
};

const sourceBank = () => ({
  positions: new Float32Array([
    16, 24, 20,
    40, 24, 20,
    16, 48, 44,
    40, 48, 44,
  ]),
  rotations: new Float32Array(16),
  sizeScales: new Float32Array([0.38, 0.38, 0.38, 0.38]),
  interactionBudgets: new Float32Array([0.9, 0.9, 0.9, 0.9]),
  groups: new Uint16Array([0, 1, 1, 2]),
});

const extents = (positions: Float32Array) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[index + axis]);
      max[axis] = Math.max(max[axis], positions[index + axis]);
    }
  }
  return { min, max };
};

test("hero placement is deterministic and owns the central frame", () => {
  const a = buildDesign01HeroFormation(sourceBank(), bounds, "side");
  const b = buildDesign01HeroFormation(sourceBank(), bounds, "side");
  assert.deepEqual(a.positions, b.positions);
  const box = extents(a.positions);
  const centerX = (box.min[0] + box.max[0]) * 0.5;
  const expectedX = bounds.min[0] + (bounds.max[0] - bounds.min[0]) * 0.63;
  assert.ok(Math.abs(centerX - expectedX) < 0.01);
  assert.ok(box.max[0] - box.min[0] > 30);
  assert.equal(a.sizeScales.length, 4);
  assert.ok(
    a.interactionBudgets.every((value) => Math.abs(value - 1.35) < 1e-5),
  );
});

test("banded placement stays inside the safe simulation bounds", () => {
  const bank = buildDesign01HeroFormation(sourceBank(), bounds, "banded");
  const box = extents(bank.positions);
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(box.min[axis] >= bounds.min[axis]);
    assert.ok(box.max[axis] <= bounds.max[axis]);
  }
});
