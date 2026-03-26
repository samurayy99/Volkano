# Flow Engine Ownership

## Owners

- Source behavior and convergence up to freeze: MLS-MPM simulator
- Post-freeze clearing / erosion: particle renderer
- Chamber presentation and backplate visuals: background geometry
- Stage timing and proof handoff: engine bridge
- Product flow and DOM states: SpatialChamber / shell

## Live-path rules

- Source anchor is explicit chamber-space data, not derived from backplate imagery
- Backplate is a visual carrier only, not a source-authority object
- Renderer may consume chamber bounds and chamber centers, but not source-from-image semantics
- Simulator must not own post-freeze clearing
- DOM/CSS must not own particle motion

## Forbidden couplings

- Deriving source origin from backplate UV or crater imagery
- Importing chamber descriptors from `backgroundGeometry.js`
- Reintroducing simulator-owned post-freeze pull/capture/clear logic
- Using DOM state to fake particle-space motion
