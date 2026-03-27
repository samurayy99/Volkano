# VOLKANO Post-Freeze Handoff

This is the current handoff for any new session working on the
Post-Enter / Pre-Proof sequence.

Read this after `CLAUDE.md`.

## What Matters Right Now

The active bottleneck is still the renderer-owned beat between:

- freeze monument
- post-freeze clearing
- quiet chamber
- DOM proof

But there is one important branch-health note:

- a recent renderer pass caused a black pre-enter chamber because the particle
  material exceeded the WebGPU vertex-varying limit
- that hard blackout was fixed by removing two unused varyings in
  `particleRenderer.js`
- the source now renders again, but the current branch should still be sanity-
  checked in a fresh browser session before any new visual pass is judged

So:

- primary creative bottleneck: post-freeze read
- immediate safety check in any fresh session: pre-enter source is visible and
  the chamber is not black

The browser read is the final authority.

## Current Verified Truths

### 1. The renderer is the visible post-freeze owner

This is still true.

- the simulator owns source, convergence, slowdown, compression, and freeze
- the simulator does not own post-freeze choreography
- `postFreezeSimLock` keeps the solver out of the visible post-freeze beat
- the particle renderer now owns the post-freeze motion, visibility, and
  material death

Do not restart from "maybe the simulator is secretly still pulling the mass"
unless a new codepath is found.

### 2. The old wall-deposit / receiver-wall model is no longer the live branch

This is the most important thing a fresh session must not get wrong.

The current branch is not:

- receiver walls
- deposit patches
- ceiling/floor patch families
- surface hold / wall flatten / residue pads

Those mental models are outdated.

Current live branch:

- volumetric clearing in `particleRenderer.js`
- `core`, `fringe`, and `loss` populations
- forward/sweep targets such as:
  - `spearTarget`
  - `fringeBandTarget`
  - `fringeSweepTarget`
  - `lossTarget`
  - `lossSweepTarget`
- chamber support through `clearFieldMix`
- no `receiverImpactMix`
- no receiver-specific lights

If a new session starts proposing deposits, receives, wall wakes, or surface
settling as if they are still current architecture, it is starting from stale
context.

### 3. Chamber support is now neutral clearing support, not receiver drama

Current support layer:

- `engineBridge.ts` emits `clearFieldMix`
- `lights.js` uses `hemi`, `keyLight`, `rimLight`, and `frontVolumeLight`
- `backgroundGeometry.js` only gives subtle carrier/silhouette response

The chamber is supposed to support depth and clearing, not act like four walls
are "receiving" matter.

### 4. Cleanup/ownership work was real, but did not solve the visual read

The codebase is cleaner than before.

That does not mean the current visual result is correct.

Already true:

- source anchor and chamber descriptors were separated from backplate semantics
- duplicated ownership around old post-freeze systems was reduced
- stale wall/receiver families were removed from the live branch

Still true:

- cleanup did not automatically produce an award-level material sentence
- the branch is now failing more on composition and material read than on pure
  architecture chaos

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
- `clearFieldMix`
- proof-ready timing

Not owner of:

- visible particle choreography details

### Particle renderer

Primary owner of:

- post-freeze motion architecture
- `core` / `fringe` / `loss` role behavior
- front-pass visibility
- near-camera shrink/separation
- late cull / hard clear
- post-freeze color/emissive shaping

This is still the main active problem area.

### Background geometry

Owner of:

- chamber carrier
- back wall / backplate visuals
- subtle clearing support

Not owner of:

- source origin authority
- particle motion
- post-freeze deposits

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

- `/Users/lenox27/my_project/src/flow-engine/mls-mpm/particleRenderer.js`

Supporting:

- `/Users/lenox27/my_project/src/flow-engine/engineBridge.ts`
- `/Users/lenox27/my_project/src/flow-engine/lights.js`
- `/Users/lenox27/my_project/src/flow-engine/backgroundGeometry.js`
- `/Users/lenox27/my_project/src/flow-engine/vesselDescriptors.js`
- `/Users/lenox27/my_project/docs/OWNERSHIP.md`
- `/Users/lenox27/my_project/CLAUDE.md`

## Current Renderer State

The current post-freeze branch is roughly:

- frozen monument as base memory
- distance-staggered release
- `core` spear lane
- `fringe` chamber bands plus sweep
- `loss` peel/sweep and cull
- near-camera separation/shrink
- quiet-chamber hard clear

Important consequences:

- this is not a wall-settle branch anymore
- this is not a pure one-step forward wipe either
- it is a layered volumetric clearing branch with staged motion families

## Current Visible Strengths

Compared with older branches:

- the old crack-vacuum / rift-suction read is not the main problem anymore
- there is now a real forward volumetric read
- there is now at least some front-pass / toward-viewer payoff
- receiver-wall semantics are no longer dominating the chamber

These gains should not be casually thrown away.

## Current Visible Failures

This is the part a fresh session should trust most.

### 1. The post-freeze beat is still not award-level

Current failure reads still include:

- too much central mound / volumetric body through the middle
- too much dense screen coverage when too much material reaches the near pass
- front-pass not yet selective/expensive enough
- too much "effect improving itself" instead of one inevitable material sentence

### 2. The source stage is currently not healthy enough to ignore

Even though source is not the intended work area, this branch recently proved
that renderer changes can break pre-enter badly.

Current status:

- black pre-enter bug: fixed
- source visibility in pre-enter: restored
- source quality: currently regressed and flatter / rod-heavier than desired

Meaning:

- do not reopen source tuning casually
- but do protect it
- any fresh session should check source before judging a new renderer pass

### 3. The latest front-safety / hard-clear logic exists in code, but should not
be treated as visually final

The live code contains:

- extra near-camera shrink for `fringe` / `loss`
- front-fade gating
- hard clear toward `quietChamber`

But the branch was interrupted by the pre-enter blackout bug.

So do not assume the newest front-safety pass is already a successful visual
solution just because it is in code.

## What A Fresh Session Must Not Do

Do not restart from these stale assumptions:

- "the current branch is still wall deposits"
- "receiver walls are still the live owner"
- "the simulator probably still owns the post-freeze beat"
- "cleanup archaeology is the highest-value next move"
- "source can be ignored completely even if renderer edits break pre-enter"

Do not propose:

- particle typography or logo formation
- receiver-wall wake/drama as the main answer
- simulator-owned post-freeze choreography
- decorative luxury FX to hide weak form
- broad app/shell rewrites when the active issue is renderer-side

## Best Current Working Method

For the next session:

1. Start with a fresh browser reload.
2. Confirm pre-enter source/chamber are visible.
3. Confirm there is no black WebGPU failure state lingering.
4. Then judge the post-freeze beat.
5. Keep passes narrow and renderer-owned unless a different owner is clearly
   proven.

The right standard is still:

- one meaningful hypothesis per pass
- one real visual delta
- no defending weak deltas

## If You Are Claude In a Fresh Session

Start from these assumptions:

- `CLAUDE.md` is the strategic brief
- `OWNERSHIP.md` is still valid
- older handoff notes about wall deposits are stale
- the live post-freeze branch is volumetric clearing, not receiver-wall deposit
- the main owner is `particleRenderer.js`
- the branch recently had a renderer-caused pre-enter blackout, now fixed
- source is visible again, but should be protected from further regression
- the next useful contribution is a disciplined renderer read pass, not another
  cleanup archaeology pass
