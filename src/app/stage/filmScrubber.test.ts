import assert from "node:assert/strict";
import test from "node:test";
import { progressWithinSegment } from "./filmScrubber.ts";

test("maps the journey into a bounded film segment", () => {
  const segment = { start: 0, end: 0.62 };

  assert.equal(progressWithinSegment(-1, segment), 0);
  assert.equal(progressWithinSegment(0, segment), 0);
  assert.equal(progressWithinSegment(0.31, segment), 0.5);
  assert.equal(progressWithinSegment(0.62, segment), 1);
  assert.equal(progressWithinSegment(1, segment), 1);
});

test("handles delayed and zero-length segments", () => {
  assert.equal(progressWithinSegment(0.4, { start: 0.4, end: 0.8 }), 0);
  assert.ok(
    Math.abs(progressWithinSegment(0.6, { start: 0.4, end: 0.8 }) - 0.5) <
      Number.EPSILON,
  );
  assert.equal(progressWithinSegment(0.8, { start: 0.4, end: 0.8 }), 1);
  assert.equal(progressWithinSegment(0.5, { start: 0.5, end: 0.5 }), 1);
});
