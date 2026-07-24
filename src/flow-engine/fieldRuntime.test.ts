import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("field runtime has no character, vessel, HDRI or film dependency", () => {
  const field = readFileSync(new URL("./fieldRuntime.ts", import.meta.url), "utf8");
  for (const forbidden of [
    "lenoxVessel",
    "lenoxAuthoredCharacter",
    "createLenoxBackdrop",
    "autumn_field_puresky",
    "filmScrubber",
    "./app.js",
  ]) {
    assert.equal(field.includes(forbidden), false, forbidden);
  }
});

test("public bridge keeps Three and both runtimes behind dynamic imports", () => {
  const bridge = readFileSync(new URL("./engineBridge.ts", import.meta.url), "utf8");
  assert.equal(bridge.includes('from "three/webgpu"'), false);
  assert.match(bridge, /import\("\.\/fieldRuntime"\)/);
  assert.match(bridge, /import\("\.\/legacyEngineBridge"\)/);
});
