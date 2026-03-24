# Runtime Ownership Map

## Main Runtime Ownership Layers

- App shell: [src/app/layout.tsx](/Users/lenox27/my_project/src/app/layout.tsx) loads global styles and trigger styles. [src/app/page.tsx](/Users/lenox27/my_project/src/app/page.tsx) mounts the chamber runtime.
- Spatial orchestration: [src/app/SpatialChamber.tsx](/Users/lenox27/my_project/src/app/SpatialChamber.tsx) owns the top-level state projection, engine mount path, proof and rotation handoff, preview/debug query params, and the DOM data attributes that CSS reads.
- Convergence state machine: [src/convergence/core/convergence-controller.ts](/Users/lenox27/my_project/src/convergence/core/convergence-controller.ts), [src/convergence/core/convergence-phases.ts](/Users/lenox27/my_project/src/convergence/core/convergence-phases.ts), [src/convergence/core/convergence-selectors.ts](/Users/lenox27/my_project/src/convergence/core/convergence-selectors.ts), and [src/convergence/core/convergence-types.ts](/Users/lenox27/my_project/src/convergence/core/convergence-types.ts) own authored phase state and gating.
- Sequence trigger layer: [src/convergence/ui/ConvergenceTrigger.tsx](/Users/lenox27/my_project/src/convergence/ui/ConvergenceTrigger.tsx) and [src/convergence/ui/useConvergenceTimeline.ts](/Users/lenox27/my_project/src/convergence/ui/useConvergenceTimeline.ts) own the entry action and the authored progress curve.
- State-to-engine bridge: [src/convergence/engine/convergence-engine-bridge.ts](/Users/lenox27/my_project/src/convergence/engine/convergence-engine-bridge.ts) and [src/convergence/engine/convergence-progress-map.ts](/Users/lenox27/my_project/src/convergence/engine/convergence-progress-map.ts) translate authored convergence state into engine signals.
- Engine lifecycle: [src/flow-engine/FlowEngineHost.tsx](/Users/lenox27/my_project/src/flow-engine/FlowEngineHost.tsx) owns the DOM host and pointer events. [src/flow-engine/engineBridge.ts](/Users/lenox27/my_project/src/flow-engine/engineBridge.ts) owns WebGPU init, render loop, presets, signal application, and engine-side freeze/proof timing.
- Scene composition: [src/flow-engine/app.js](/Users/lenox27/my_project/src/flow-engine/app.js) owns camera, scene, HDRI, source mapping, postprocessing, debug view switching, and frame update order.
- Simulation and rendering: [src/flow-engine/mls-mpm/mlsMpmSimulator.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/mlsMpmSimulator.js) owns particle motion and thermal state. [src/flow-engine/mls-mpm/particleRenderer.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/particleRenderer.js) owns particle form and material read. [src/flow-engine/backgroundGeometry.js](/Users/lenox27/my_project/src/flow-engine/backgroundGeometry.js) owns the vessel geometry and chamber materials.

## WebGL / Rendering / Material Owners

- [src/flow-engine/engineBridge.ts](/Users/lenox27/my_project/src/flow-engine/engineBridge.ts): applies phase presets and convergence-driven render/sim knobs through `conf`.
- [src/flow-engine/app.js](/Users/lenox27/my_project/src/flow-engine/app.js): camera framing, HDRI, environment intensity, exposure, bloom composition, source mapping, and debug visibility.
- [src/flow-engine/mls-mpm/particleRenderer.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/particleRenderer.js): particle geometry, TSL position logic, settled-floor shaping, surface color, emissive behavior, and MRT bloom output.
- [src/flow-engine/mls-mpm/mlsMpmSimulator.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/mlsMpmSimulator.js): convergence pull, freeze damping, post-freeze settle field, thermal extinction, ignition memory, and particle color state generation.
- [src/flow-engine/backgroundGeometry.js](/Users/lenox27/my_project/src/flow-engine/backgroundGeometry.js): vessel frame, liners, side walls, back wall, backplate image plane, crater anchor, and source descriptor geometry.
- [src/flow-engine/lights.js](/Users/lenox27/my_project/src/flow-engine/lights.js): spot, hemi, and rim light setup.
- [src/flow-engine/conf.js](/Users/lenox27/my_project/src/flow-engine/conf.js): shared render and sim parameters consumed across the live engine.

## Sequence / Staging / Timing Owners

- [src/app/SpatialChamber.tsx](/Users/lenox27/my_project/src/app/SpatialChamber.tsx): `FREEZE_FALLBACK_MS`, `PROOF_READY_FALLBACK_MS`, `PROOF_HOLD_MS`, proof reveal, rotation start, hero landed, interface activation, and scroll reset.
- [src/convergence/core/convergence-controller.ts](/Users/lenox27/my_project/src/convergence/core/convergence-controller.ts): canonical state transitions and guards.
- [src/convergence/core/convergence-phases.ts](/Users/lenox27/my_project/src/convergence/core/convergence-phases.ts): phase naming and progression logic.
- [src/convergence/ui/useConvergenceTimeline.ts](/Users/lenox27/my_project/src/convergence/ui/useConvergenceTimeline.ts): authored enter-run timing and easing.
- [src/convergence/engine/convergence-progress-map.ts](/Users/lenox27/my_project/src/convergence/engine/convergence-progress-map.ts): threshold bands for slowdown, densify, freeze, thermal extinction, and pointer reduction.
- [src/flow-engine/engineBridge.ts](/Users/lenox27/my_project/src/flow-engine/engineBridge.ts): engine-side `FREEZE_SETTLE_DELAY`, `POST_FREEZE_PROOF_HOLD`, and `RENDERER_SEAM_DURATION`.
- [src/app/globals.css](/Users/lenox27/my_project/src/app/globals.css): `chamber-rotate`, `front-yield`, `proof-copy-reveal`, `hero-copy-reveal`, `proof-front-reveal`, and all `data-phase` / `data-view` branches.

## Current Late-Signal Ownership Notes

- `settleMix` is a live bridge-to-sim-and-render signal today. It becomes `conf.postFreezeSettleMix` in [src/flow-engine/engineBridge.ts](/Users/lenox27/my_project/src/flow-engine/engineBridge.ts), drives downward settle in [src/flow-engine/mls-mpm/mlsMpmSimulator.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/mlsMpmSimulator.js), and also becomes `convergenceSettle -> materialSettle -> settledFooting` in [src/flow-engine/mls-mpm/particleRenderer.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/particleRenderer.js). This is currently the dominant late-frame owner.
- `convergenceThermalExtinction` is a live bridge-to-simulator signal. It changes `heat` and `color` in [src/flow-engine/mls-mpm/mlsMpmSimulator.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/mlsMpmSimulator.js), but does not have a dedicated renderer-side late branch in [src/flow-engine/mls-mpm/particleRenderer.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/particleRenderer.js).
- `seamAbsorption` is a live bridge-to-simulator signal. It is created late in [src/flow-engine/engineBridge.ts](/Users/lenox27/my_project/src/flow-engine/engineBridge.ts) and consumed only as a simulator velocity pull in [src/flow-engine/mls-mpm/mlsMpmSimulator.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/mlsMpmSimulator.js). There is no current renderer-owned seam-absorption consumer.
- Historical pre-proof signals such as `preProofPrototypeMix`, `residueReleaseMix`, `glyphCondenseMix`, and `glyphReadabilityMix` are documented in the pre-proof notes, but are not part of the current live runtime path. Do not assume an active prototype/pre-proof branch exists in the current workspace without re-verifying the code.

## DOM / UI / CSS Owners

- [src/app/SpatialChamber.tsx](/Users/lenox27/my_project/src/app/SpatialChamber.tsx): front face, back face, proof overlay, debug controls, preview modes, reduced-motion behavior, and the stateful DOM attributes that drive CSS.
- [src/app/globals.css](/Users/lenox27/my_project/src/app/globals.css): cube room, wall material language, proof and back-face presentation, transition visibility, responsive rules, and motion choreography.
- [src/convergence/ui/ConvergenceTrigger.tsx](/Users/lenox27/my_project/src/convergence/ui/ConvergenceTrigger.tsx): enter trigger markup and running/locked visibility.
- [src/convergence/ui/convergence-trigger.css](/Users/lenox27/my_project/src/convergence/ui/convergence-trigger.css): trigger module styling and reflection animation.
- [src/app/layout.tsx](/Users/lenox27/my_project/src/app/layout.tsx): CSS entrypoint.
- [src/app/SiteShell.tsx](/Users/lenox27/my_project/src/app/SiteShell.tsx): exists but is not part of the active runtime today.

## High-Risk Regression Zones

- [src/app/SpatialChamber.tsx](/Users/lenox27/my_project/src/app/SpatialChamber.tsx) and [src/app/globals.css](/Users/lenox27/my_project/src/app/globals.css): front, proof, rotation, and back-face state handoff all converge here. Small selector or timing changes can desync visibility, pointer access, or animation completion.
- [src/flow-engine/engineBridge.ts](/Users/lenox27/my_project/src/flow-engine/engineBridge.ts): many phase presets mutate shared `conf` state. A local-looking tweak can bleed into startup, idle, convergence, freeze, and proof.
- [src/flow-engine/mls-mpm/particleRenderer.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/particleRenderer.js): macro form and late-stage material read are combined here. Small coefficient changes can flatten source read or overcook the settled read.
- [src/flow-engine/mls-mpm/mlsMpmSimulator.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/mlsMpmSimulator.js): motion, heat, and color are tightly coupled. Solver changes can cause both temporal and material regressions.
- [src/flow-engine/backgroundGeometry.js](/Users/lenox27/my_project/src/flow-engine/backgroundGeometry.js) and [src/flow-engine/app.js](/Users/lenox27/my_project/src/flow-engine/app.js): source mapping depends on chamber geometry and world-to-sim conversion. Geometry changes can silently move the source origin.
- Reduced-motion and preview branches in [src/app/SpatialChamber.tsx](/Users/lenox27/my_project/src/app/SpatialChamber.tsx): these are alternate runtime paths and should be treated as real states, not debug-only cases.

## Narrow Leverage Points

- [src/flow-engine/app.js](/Users/lenox27/my_project/src/flow-engine/app.js): `setLook()` and `applyCameraFraming()` are the best renderer-first levers for macro read, exposure, bloom, and composition without changing solver behavior.
- [src/flow-engine/backgroundGeometry.js](/Users/lenox27/my_project/src/flow-engine/backgroundGeometry.js): chamber material colors, roughness, emissive response, and texture offsets are good narrow levers for room read.
- [src/flow-engine/mls-mpm/particleRenderer.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/particleRenderer.js): the late settle, crust, and emissive sections are the right levers when the issue is material read rather than motion.
- [src/flow-engine/engineBridge.ts](/Users/lenox27/my_project/src/flow-engine/engineBridge.ts): `applyStartupPreset()`, `applyIdlePlayPreset()`, and `applyConvergenceSignals()` are the cleanest bounded levers for phase-specific tuning.
- [src/convergence/engine/convergence-progress-map.ts](/Users/lenox27/my_project/src/convergence/engine/convergence-progress-map.ts): threshold windows are the right lever when a transition is happening too early or too late.
- [src/app/globals.css](/Users/lenox27/my_project/src/app/globals.css): `data-view` and `data-phase` branches are the cleanest levers for DOM-only proof, back-face, and presentation fixes.
- [src/app/SpatialChamber.tsx](/Users/lenox27/my_project/src/app/SpatialChamber.tsx): `getFrontRailAnchorGeometry()` and trigger-anchor wiring are the right levers for front trigger placement and alignment.

## Top 5 Files to Understand First

- [src/app/SpatialChamber.tsx](/Users/lenox27/my_project/src/app/SpatialChamber.tsx)
- [src/flow-engine/engineBridge.ts](/Users/lenox27/my_project/src/flow-engine/engineBridge.ts)
- [src/flow-engine/app.js](/Users/lenox27/my_project/src/flow-engine/app.js)
- [src/flow-engine/mls-mpm/particleRenderer.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/particleRenderer.js)
- [src/app/globals.css](/Users/lenox27/my_project/src/app/globals.css)

## Top 3 Rules for Visual Changes

- Diagnose ownership first. Distinguish renderer, simulator, staging, camera, DOM, and CSS before editing.
- Ship one visible hypothesis per pass. Do not mix unrelated experiments or bundle multiple levers into one patch.
- Protect working states and verify honestly. Preserve source, proof, rotation, and back-face behavior unless explicitly targeting them, and judge the image rather than the effort.
