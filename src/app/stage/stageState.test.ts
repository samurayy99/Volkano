import assert from "node:assert/strict";
import { test } from "node:test";
import { stageReducer, type StageState } from "./stageState.ts";

function advanceToTransforming(): StageState {
  let state: StageState = "dormant";
  state = stageReducer(state, { type: "ENGINE", state: "waking" });
  state = stageReducer(state, { type: "ENGINE", state: "present" });
  return stageReducer(state, { type: "SPOKEN" });
}

test("GRAVITY keeps the legal transforming to building to ready transaction", () => {
  let state = advanceToTransforming();
  assert.equal(state, "transforming");
  state = stageReducer(state, { type: "TRANSFORMED" });
  assert.equal(state, "building");
  state = stageReducer(state, { type: "BUILT" });
  assert.equal(state, "ready");
});

test("device loss during creation commits to the static formed end state", () => {
  assert.equal(
    stageReducer(advanceToTransforming(), { type: "STATIC_FALLBACK" }),
    "ready",
  );
  assert.equal(
    stageReducer("building", { type: "STATIC_FALLBACK" }),
    "ready",
  );
});

test("device loss cannot skip the protected wake and recognition path", () => {
  assert.equal(stageReducer("waking", { type: "STATIC_FALLBACK" }), "waking");
  assert.equal(
    stageReducer("recognition", { type: "STATIC_FALLBACK" }),
    "recognition",
  );
});
