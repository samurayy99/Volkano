import assert from "node:assert/strict";
import test from "node:test";
import {
  DESIGN01_GRAPHITE_LAYER_COUNT,
  buildDesign01GraphiteFormation,
} from "./design01GraphiteFormation.ts";

const bounds = {
  min: [3, 10, 3] as [number, number, number],
  max: [53, 61, 61] as [number, number, number],
};

const sourceBank = () => {
  const positions: number[] = [];
  for (let layer = 0; layer < DESIGN01_GRAPHITE_LAYER_COUNT; layer += 1) {
    const y = 14 + layer * 5;
    for (let local = 0; local < 128; local += 1) {
      positions.push(12 + (local % 16) * 2, y, 14 + Math.floor(local / 16) * 4);
    }
  }
  const count = positions.length / 3;
  return {
    positions: new Float32Array(positions),
    rotations: new Float32Array(count * 4),
    sizeScales: new Float32Array(count).fill(0.74),
    interactionBudgets: new Float32Array(count).fill(2.2),
    groups: new Uint16Array(count),
  };
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
  return { min, max };
};

test("graphite monolith is deterministic, layered and spatial", () => {
  const source = sourceBank();
  const first = buildDesign01GraphiteFormation(source, bounds, "side");
  const second = buildDesign01GraphiteFormation(sourceBank(), bounds, "side");
  assert.deepEqual(first.positions, second.positions);

  const box = extents(first.positions);
  assert.ok(box.max[0] - box.min[0] > 18);
  assert.ok(box.max[1] - box.min[1] > 24);
  assert.ok(box.max[2] - box.min[2] > 8);
  assert.ok(first.sizeScales.every((value) => Math.abs(value - 0.4) < 1e-5));
  assert.ok(
    first.interactionBudgets.every((value) => Math.abs(value - 0.62) < 1e-5),
  );
});

test("nine input layers remain nine ordered depth cohorts", () => {
  const bank = buildDesign01GraphiteFormation(sourceBank(), bounds, "side");
  const averages: number[] = [];
  for (let layer = 0; layer < DESIGN01_GRAPHITE_LAYER_COUNT; layer += 1) {
    let sum = 0;
    for (let local = 0; local < 128; local += 1) {
      sum += bank.positions[(layer * 128 + local) * 3 + 2];
    }
    averages.push(sum / 128);
  }
  assert.equal(new Set(averages.map((value) => value.toFixed(4))).size, 9);
  for (let index = 1; index < averages.length; index += 1) {
    assert.ok(averages[index] > averages[index - 1]);
  }
});

test("banded graphite stays inside the safe simulation interior", () => {
  const bank = buildDesign01GraphiteFormation(sourceBank(), bounds, "banded");
  const box = extents(bank.positions);
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(box.min[axis] > bounds.min[axis]);
    assert.ok(box.max[axis] < bounds.max[axis]);
  }
  assert.ok(bank.sizeScales.every((value) => Math.abs(value - 0.44) < 1e-5));
});
