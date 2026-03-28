# Flow Engine Ownership

## Current Authoritative Truth

- Active bottleneck: the renderer-owned post-enter / pre-proof beat
- The browser read is the final authority
- Cleanup and ownership work matter, but they do not excuse a weak material read

## Owners

- Source behavior, convergence, slowdown, compression, and freeze: MLS-MPM simulator
- Post-enter / post-freeze hold, clearing, visibility shaping, and disappearance: particle renderer
- Stage timing, `collapseMix`, `quietChamberMix`, and proof handoff: engine bridge
- Chamber carrier / backplate visuals: background geometry
- Product flow, proof, rotation, hero wall, and interface states: SpatialChamber / shell / DOM

## Hard Rules

- Bridge is timing-only. It must not own particle image language or post-freeze choreography.
- Simulator must not own post-freeze clearing, travel, or disappearance.
- DOM/CSS must not fake particle-space motion.
- Renderer may use chamber-space descriptors and freeze-space data, but not backplate imagery as semantic source authority.
- Pre-enter source is protected from regression while post-enter work is in progress.

## Forbidden Couplings

- Deriving source origin from backplate UV, crater imagery, or wall visuals
- Reintroducing simulator-owned post-freeze pull / capture / clear logic
- Letting bridge timing become particle behavior ownership
- Using DOM state to fake chamber-clearing motion
- Treating decorative FX as a substitute for a correct material sentence

## Current Practical Implication

If the post-enter beat reads as:

- mound
- carpet
- brick soup
- debris cloud
- crack-fed seed
- left-edge streak garbage

then the problem is presumed to be inside `particleRenderer.js` until proven otherwise.
