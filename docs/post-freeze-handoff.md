# VOLKANO Post-Freeze Handoff

This document is the fast path for any new agent session working on the
Post-Enter / Pre-Proof sequence.

Read this after `CLAUDE.md`.

## What Matters Right Now

The source stage is considered solved enough.

The active bottleneck is the renderer-owned beat between:

- freeze monument
- post-freeze clearing / erosion
- quiet chamber
- DOM proof

The browser read is the final authority.

## Current Verified Truths

These points were verified through code audit plus browser/video review.

### 1. The simulator is no longer the visible post-freeze owner

- `postFreezeSimLock` hard-stops the solver in
  [mlsMpmSimulator.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/mlsMpmSimulator.js)
- old capture / seam / pocket ownership was removed
- the visible post-freeze problem is not a hidden simulator pull anymore

### 2. Hidden legacy ownership was cleaned enough

Already removed or reduced:

- capture / seam / pocket legacy in the simulator
- stale post-freeze conf signals
- dead transition systems
- duplicated flow-engine phase API
- redundant CSS/app debug and preview paths
- descriptor coupling where source came from backplate/crater semantics

Do not restart the investigation from “there must still be a hidden second owner”
unless a new codepath is found.

### 3. Source and backplate were refactored apart

Current descriptor ownership:

- chamber geometry lives in
  [vesselDescriptors.js](/Users/lenox27/my_project/src/flow-engine/vesselDescriptors.js)
- source anchor is explicit in the same module
- `backgroundGeometry.js` is no longer the source-of-truth for source origin
- `app.js` now syncs from explicit source anchor world data, not crater/backplate UV

This refactor was intentionally behavior-preserving for source placement.

### 4. The old “vacuum into the rift” read is now materially gone

This was improved by:

- removing centerward post-freeze translation in
  [particleRenderer.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/particleRenderer.js)
- stronger backplate suppression in
  [backgroundGeometry.js](/Users/lenox27/my_project/src/flow-engine/backgroundGeometry.js)

This change is real and should not be accidentally regressed.

### 5. The new primary failure mode is now different

Current visible failure read:

- no more suction into the rift
- but the “explosion” reads as a pop / interpolation event
- deposits at walls/ceiling/floor are too few, too thin, too discrete
- a rectangular / rail / frame-like read appears
- the backplate suppression is useful but currently a bit too binary

In other words:

- old enemy: crack vacuum
- new enemy: patch distribution / weak release / weak deposits

## Current Live Owners

### Simulator

Owner of:

- live source behavior
- convergence
- slowdown
- freeze

Not owner of:

- post-freeze clearing
- post-freeze flight
- post-freeze disappearance choreography

### Engine bridge

Owner of:

- convergence timing
- freeze handoff
- `collapseMix`
- `quietChamberMix`
- proof-ready timing

Not owner of:

- visible particle choreography

### Particle renderer

Current owner of:

- post-freeze release
- deposit targeting
- post-freeze scale
- post-freeze color/emissive

This is the main active problem area.

### Background geometry

Owner of:

- chamber carrier
- WebGL back wall / backplate
- source debug visualization

Not owner of:

- source origin authority
- particle motion

### DOM/CSS

Owner of:

- proof
- shell
- rotation
- hero wall reveal

Not owner of:

- particle-space movement

## Files That Matter Now

Primary:

- [particleRenderer.js](/Users/lenox27/my_project/src/flow-engine/mls-mpm/particleRenderer.js)
- [backgroundGeometry.js](/Users/lenox27/my_project/src/flow-engine/backgroundGeometry.js)

Supporting:

- [engineBridge.ts](/Users/lenox27/my_project/src/flow-engine/engineBridge.ts)
- [vesselDescriptors.js](/Users/lenox27/my_project/src/flow-engine/vesselDescriptors.js)
- [OWNERSHIP.md](/Users/lenox27/my_project/docs/OWNERSHIP.md)

## Current Renderer State

Current post-freeze path is renderer-only and roughly:

- frozen monument base position
- release interpolation toward prepared deposit patches
- patch families on side walls, ceiling, and floor
- release color/emissive pulse
- quiet chamber fade

This solved the suction read, but now exposes the next structural problem:

- the movement still reads too much like target interpolation
- not enough like material release → flight → impact → smear

## Best Current Architectural Insight

The next useful renderer refactor should likely move from:

- `home -> target interpolation`

toward:

- `home`
- plus additive `flight offset`
- then `settle / deposit target`

Meaning:

- keep frozen monument as home basis
- create a real outward flight phase before deposits take over
- only then settle to chamber surfaces

This idea was supported by both:

- browser/video diagnosis of the current failure
- logic cherry-picks from
  [particle_examples.txt](/Users/lenox27/my_project/docs/particle_examples.txt)

Important:

- do not copy the examples literally
- do not import demo aesthetics, bloom logic, black-hole logic, or disintegration style
- only the motion architecture is relevant

## What Is Explicitly Not Wanted

Do not propose or reintroduce:

- simulator-owned post-freeze choreography
- black hole / crack vacuum / seam capture logic
- particle typography or particle logo formation
- decorative luxury VFX as a substitute for material read
- broad speculative rewrites of app/convergence/CSS when the active bug is renderer-side
- endless scalar tuning without structural change

## Video Evidence

Recent videos worth checking:

- suction-removal pass:
  `/Users/lenox27/my_project/frames/Screen Recording 2026-03-26 at 18.51.45.mp4`
- prior state showing vacuum/rift dominance:
  `/Users/lenox27/my_project/frames/Screen Recording 2026-03-26 at 18.40.23.mp4`

Recent contact sheets:

- [freeze-to-release-contact.jpg](/Users/lenox27/my_project/output/video-review/2026-03-26-185145/freeze-to-release-contact.jpg)
- [release-to-proof-contact.jpg](/Users/lenox27/my_project/output/video-review/2026-03-26-185145/release-to-proof-contact.jpg)
- [freeze-to-burst-contact.jpg](/Users/lenox27/my_project/output/video-review/2026-03-26-184023/freeze-to-burst-contact.jpg)
- [burst-to-tail-contact.jpg](/Users/lenox27/my_project/output/video-review/2026-03-26-184023/burst-to-tail-contact.jpg)

## If You Are Claude In a Fresh Session

Start from these assumptions:

- the codebase has already been heavily cleaned
- the current bug is no longer primarily hidden legacy
- the active issue is the live renderer/backplate read
- the suction issue has been materially improved already
- the next useful contribution is a disciplined renderer architecture plan, not a restart of cleanup archaeology
