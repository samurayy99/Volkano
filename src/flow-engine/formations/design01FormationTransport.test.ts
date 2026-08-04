import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchFormationTargetByGroup,
  spatiallyMatchFormationTarget,
} from "./design01FormationTransport.ts";

type Bank = Parameters<typeof spatiallyMatchFormationTarget>[0];

const bank = (
  positions: number[],
  order = Array.from({ length: positions.length / 3 }, (_, index) => index),
) => {
  return {
    positions: new Float32Array(order.flatMap((index) =>
      positions.slice(index * 3, index * 3 + 3))),
    rotations: new Float32Array(order.flatMap((index) => [index, 0, 0, 1])),
    sizeScales: new Float32Array(order.map((index) => index + 0.5)),
    interactionBudgets: new Float32Array(order.map((index) => index + 1.5)),
    groups: new Uint16Array(order.map((index) => index % 3)),
  } satisfies Bank;
};

const cube = [
  0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0,
  0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
];
test("spatial matching restores local correspondence without mutating either bank", () => {
  const from = bank(cube);
  const permutation = [7, 2, 5, 0, 6, 1, 4, 3];
  const translated = cube.map((value, index) => value * 3 + (index % 3) * 10);
  const to = bank(translated, permutation);
  const before = to.positions.slice();
  const matched = spatiallyMatchFormationTarget(from, to);

  assert.deepEqual(to.positions, before);
  for (let index = 0; index < from.positions.length / 3; index += 1) {
    const expected = [
      from.positions[index * 3] * 3,
      from.positions[index * 3 + 1] * 3 + 10,
      from.positions[index * 3 + 2] * 3 + 20,
    ];
    assert.deepEqual(
      Array.from(matched.positions.slice(index * 3, index * 3 + 3)),
      expected,
    );
  }
});

test("slot metadata follows the matched target position", () => {
  const from = bank(cube);
  const to = bank(cube, [7, 6, 5, 4, 3, 2, 1, 0]);
  const matched = spatiallyMatchFormationTarget(from, to);
  assert.equal(matched.sizeScales[0], 0.5);
  assert.equal(matched.interactionBudgets[7], 8.5);
  assert.equal(matched.groups[5], 5 % 3);
});
test("spatial matching rejects unequal populations", () => {
  assert.throws(
    () => spatiallyMatchFormationTarget(bank(cube), bank(cube.slice(0, -3))),
    /equal source and target populations/,
  );
});

test("grouped matching keeps every cohort isolated", () => {
  const positions = [
    0, 0, 0, 1, 0, 0,
    10, 0, 0, 11, 0, 0,
    20, 0, 0, 21, 0, 0,
  ];
  const from = bank(positions);
  from.groups.set([0, 0, 1, 1, 2, 2]);
  const to = bank(positions, [5, 4, 3, 2, 1, 0]);
  to.groups.set([2, 2, 1, 1, 0, 0]);
  const matched = matchFormationTargetByGroup(from, to);

  assert.deepEqual(Array.from(matched.groups), [0, 0, 1, 1, 2, 2]);
  for (let index = 0; index < matched.groups.length; index += 1) {
    assert.equal(matched.groups[index], from.groups[index]);
  }
});

test("grouped matching rejects mismatched cohort populations", () => {
  const from = bank(cube);
  const to = bank(cube);
  from.groups.set([0, 0, 0, 1, 1, 1, 2, 2]);
  to.groups.set([0, 0, 1, 1, 1, 2, 2, 2]);
  assert.throws(
    () => matchFormationTargetByGroup(from, to),
    /unequal source and target populations/,
  );
});
