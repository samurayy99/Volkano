/**
 * Canonical MLS-MPM particle layout. StructuredArray annotates member objects
 * while parsing, so callers receive a fresh definition rather than sharing
 * mutated layout metadata across engine instances and tests.
 */
export const createParticleStruct = () => ({
  position: { type: "vec3" },
  density: { type: "float" },
  velocity: { type: "vec3" },
  mass: { type: "float" },
  C: { type: "mat3" },
  direction: { type: "vec3" },
  color: { type: "vec3" },
  heat: { type: "float" },
  dissolveState: { type: "vec2" },
  coherence: { type: "float" },
});
