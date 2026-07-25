import assert from "node:assert/strict";
import { test } from "node:test";
import { createParticleStruct } from "./particleStruct.js";
import { StructuredArray } from "./structuredArray.js";

test("coherence occupies existing particle stride padding", () => {
  const particles = new StructuredArray(
    createParticleStruct(),
    1,
    "particleLayoutTest",
  );

  assert.equal(particles.layout.coherence.offset, 30);
  assert.equal(particles.structSize, 32);
  assert.equal(particles.structSize * Float32Array.BYTES_PER_ELEMENT, 128);
});
