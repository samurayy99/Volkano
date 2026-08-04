import assert from "node:assert/strict";
import { test } from "node:test";
import { isHostOwnedRuntimeMode } from "./experienceMode.ts";

test("isolated field hosts own their runtime without a chamber drive", () => {
  assert.equal(isHostOwnedRuntimeMode("phase-field"), true);
  assert.equal(isHostOwnedRuntimeMode("hero-field"), true);
  assert.equal(isHostOwnedRuntimeMode("chamber"), false);
  assert.equal(isHostOwnedRuntimeMode("living-surface"), false);
  assert.equal(isHostOwnedRuntimeMode("legacy-lenox"), false);
});
