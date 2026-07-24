import assert from "node:assert/strict";
import { test } from "node:test";
import { createMorphTransactionGate, getMorphTimings } from "./morphTransaction.ts";

test("only the latest morph transaction remains authoritative", () => {
  const gate = createMorphTransactionGate();
  const first = gate.begin();
  const second = gate.begin();

  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);

  gate.cancel();
  assert.equal(gate.isCurrent(second), false);
});

test("reduced motion changes duration, not the commit and finish sequence", () => {
  const regular = getMorphTimings(false);
  const reduced = getMorphTimings(true);

  assert.ok(regular.commitMs < regular.finishMs);
  assert.ok(reduced.commitMs < reduced.finishMs);
  assert.ok(reduced.finishMs < regular.finishMs);
});
