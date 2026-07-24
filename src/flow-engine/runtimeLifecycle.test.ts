import assert from "node:assert/strict";
import { test } from "node:test";
import { RuntimeLifecycleGate } from "./runtimeLifecycle.ts";

test("field lifecycle keeps exactly one running state across pause reasons", () => {
  const lifecycle = new RuntimeLifecycleGate();
  lifecycle.beginInitializing();
  assert.equal(lifecycle.markReady(), "start");
  assert.equal(lifecycle.state, "running");
  assert.equal(lifecycle.suspend("reality"), "stop");
  assert.equal(lifecycle.suspend("reality"), "none");
  assert.equal(lifecycle.suspend("document-hidden"), "none");
  assert.equal(lifecycle.resume("reality"), "none");
  assert.equal(lifecycle.resume("document-hidden"), "start");
  assert.equal(lifecycle.resume("document-hidden"), "none");
  assert.equal(lifecycle.state, "running");
});

test("failure and disposal are terminal", () => {
  const lifecycle = new RuntimeLifecycleGate();
  lifecycle.beginInitializing();
  lifecycle.markReady();
  assert.equal(lifecycle.fail(), "stop");
  assert.equal(lifecycle.resume("reality"), "none");
  assert.equal(lifecycle.state, "failed");
  assert.equal(lifecycle.dispose(), "none");
  assert.equal(lifecycle.state, "disposed");
});
