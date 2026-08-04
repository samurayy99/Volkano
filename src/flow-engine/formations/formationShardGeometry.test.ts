import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFormationShardGeometryData } from "./formationShardGeometry.js";

test("formation shard is deterministic, finite, flat and non-degenerate", () => {
  const first = buildFormationShardGeometryData();
  const second = buildFormationShardGeometryData();
  assert.deepEqual(first, second);
  assert.equal(first.positions.length, 24 * 3);
  assert.equal(first.normals.length, 24 * 3);
  assert.equal(first.uvs.length, 24 * 2);
  assert.equal(first.indices.length, 12 * 3);
  assert.equal(first.triangleAreas.length, 12);
  assert.equal(first.positions.every(Number.isFinite), true);
  assert.equal(first.normals.every(Number.isFinite), true);
  assert.equal(first.uvs.every(Number.isFinite), true);
  assert.equal(first.triangleAreas.every((area) => area > 1e-8), true);

  for (let face = 0; face < 6; face += 1) {
    const offset = face * 4 * 3;
    const normal = first.normals.slice(offset, offset + 3);
    assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-6);
    for (let vertex = 1; vertex < 4; vertex += 1) {
      assert.deepEqual(
        first.normals.slice(offset + vertex * 3, offset + vertex * 3 + 3),
        normal,
      );
    }
  }
});
