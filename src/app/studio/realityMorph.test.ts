import assert from "node:assert/strict";
import { test } from "node:test";
import { isCurrentMorphToken, selectVisualBase } from "./realityMorph.ts";

test("hammering chooses the visually dominant reality", () => {
  assert.equal(selectVisualBase("signal", "gravity", 0.49), "signal");
  assert.equal(selectVisualBase("signal", "gravity", 0.5), "gravity");
  assert.equal(selectVisualBase("gravity", "atelier", 0.9), "atelier");
});

test("only the current transition token may commit", () => {
  assert.equal(isCurrentMorphToken(4, 4), true);
  assert.equal(isCurrentMorphToken(3, 4), false);
});
