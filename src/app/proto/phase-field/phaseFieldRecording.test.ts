import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PHASE_FIELD_RECORDING,
  phaseFieldRecordingPreset,
  samplePhaseFieldRecording,
} from "./phaseFieldRecording.ts";

test("the recording changes exactly one factor per control", () => {
  const baseline = phaseFieldRecordingPreset("default");
  const triNoise = phaseFieldRecordingPreset("tri-noise");
  const flat = phaseFieldRecordingPreset("flat");
  const shard = phaseFieldRecordingPreset("shard");

  assert.deepEqual({ ...triNoise, curl: baseline.curl }, baseline);
  assert.deepEqual(
    { ...flat, coherenceMaterial: baseline.coherenceMaterial },
    baseline,
  );
  assert.deepEqual({ ...shard, primitive: baseline.primitive }, baseline);
});

test("the scripted path holds stationary for 25 seconds", () => {
  const start = samplePhaseFieldRecording(19_000);
  const middle = samplePhaseFieldRecording(31_500);
  const end = samplePhaseFieldRecording(43_999);

  assert.equal(start.beat, "stationary-pointer");
  assert.deepEqual(start.pointer, middle.pointer);
  assert.deepEqual(start.pointer, end.pointer);
});

test("pointer leave and phase recovery are explicit", () => {
  assert.equal(samplePhaseFieldRecording(43_999).phase, "lenox");
  assert.equal(samplePhaseFieldRecording(44_000).phase, "ambient");
  assert.equal(samplePhaseFieldRecording(44_000).pointer, null);
  assert.equal(
    samplePhaseFieldRecording(PHASE_FIELD_RECORDING.durationMs).pointer,
    null,
  );
});

test("every pointer sample remains inside the viewport", () => {
  for (let t = 0; t <= PHASE_FIELD_RECORDING.durationMs; t += 1000 / 60) {
    const pointer = samplePhaseFieldRecording(t).pointer;
    if (!pointer) continue;
    assert.ok(pointer.x >= 0 && pointer.x <= 1);
    assert.ok(pointer.y >= 0 && pointer.y <= 1);
  }
});
