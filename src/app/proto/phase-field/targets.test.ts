import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_FOCUS,
  ambientAnchors,
  clampToBounds,
  focusField,
  type Bounds,
} from "./targets.ts";

const BOUNDS: Bounds = { min: [4, 4, 26], max: [60, 60, 34] };

test("ambient anchors fill the box instead of clumping in the middle", () => {
  const pts = ambientAnchors(4096, BOUNDS);
  let inLeftHalf = 0;
  let inBottomHalf = 0;
  const midX = (BOUNDS.min[0] + BOUNDS.max[0]) / 2;
  const midY = (BOUNDS.min[1] + BOUNDS.max[1]) / 2;
  for (let i = 0; i < pts.length; i += 3) {
    if (pts[i] < midX) inLeftHalf++;
    if (pts[i + 1] < midY) inBottomHalf++;
  }
  const n = pts.length / 3;
  // A distribution, not the central ignition sphere the dust seed produces.
  assert.ok(Math.abs(inLeftHalf / n - 0.5) < 0.08);
  assert.ok(Math.abs(inBottomHalf / n - 0.5) < 0.08);
});

test("anchors are deterministic — the same index always lands in the same place", () => {
  const a = ambientAnchors(512, BOUNDS);
  const b = ambientAnchors(512, BOUNDS);
  assert.deepEqual(Array.from(a), Array.from(b));
});

test("anchors drift over time, so ambient settles toward a moving rest state", () => {
  const t0 = ambientAnchors(512, BOUNDS, 0, 1.5);
  const t1 = ambientAnchors(512, BOUNDS, 9, 1.5);
  let moved = 0;
  for (let i = 0; i < t0.length; i += 3) {
    if (Math.abs(t0[i] - t1[i]) > 1e-6) moved++;
  }
  assert.ok(moved > 400, "a static anchor bank would be a starfield");
});

test("zero drift produces a fixed bank — the debug control still works", () => {
  const t0 = ambientAnchors(256, BOUNDS, 0, 0);
  const t1 = ambientAnchors(256, BOUNDS, 40, 0);
  assert.deepEqual(Array.from(t0), Array.from(t1));
});

test("the focus field is asymmetric — a symmetric one would read as an eye", () => {
  const pts = focusField(4096, BOUNDS, DEFAULT_FOCUS);
  const cx = (BOUNDS.min[0] + BOUNDS.max[0]) / 2 + DEFAULT_FOCUS.focusOffset[0];
  let left = 0;
  let right = 0;
  for (let i = 0; i < pts.length; i += 3) {
    if (pts[i] < cx) left++;
    else right++;
  }
  const imbalance = Math.abs(left - right) / (left + right);
  assert.ok(imbalance > 0.08, `too balanced (${imbalance.toFixed(3)}) — reads as a ring`);
});

test("the focus field is anisotropic — round would read as a blob", () => {
  const pts = focusField(4096, BOUNDS, DEFAULT_FOCUS);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
    minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]);
  }
  const ratio = (maxX - minX) / Math.max(maxY - minY, 0.001);
  assert.ok(ratio > 1.2 || ratio < 0.83, `too round (${ratio.toFixed(2)})`);
});

test("clamping keeps every point inside the solver's safe interior", () => {
  const pts = clampToBounds(focusField(2048, BOUNDS, {
    ...DEFAULT_FOCUS,
    anisotropy: 40,
  }), BOUNDS);
  for (let i = 0; i < pts.length; i += 3) {
    assert.ok(pts[i] >= BOUNDS.min[0] && pts[i] <= BOUNDS.max[0]);
    assert.ok(pts[i + 1] >= BOUNDS.min[1] && pts[i + 1] <= BOUNDS.max[1]);
    assert.ok(pts[i + 2] >= BOUNDS.min[2] && pts[i + 2] <= BOUNDS.max[2]);
  }
});
