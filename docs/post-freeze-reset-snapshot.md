# Post-Freeze Reset Snapshot

Date: 2026-04-05

## Scope
This snapshot exists to support a surgical reset of the burned post-freeze experiment cluster only.
It does not recommend a repo-wide rollback.

Primary reset candidates:
- `src/flow-engine/mls-mpm/particleRenderer.js`
- `src/flow-engine/app.js`
- `src/flow-engine/engineBridge.ts`
- `src/flow-engine/conf.js`

## What Changed In This Burned Branch

### `src/flow-engine/mls-mpm/particleRenderer.js`
- Accumulated repeated late-branch experiments:
  - shell/core timing retunes
  - release/extinction coupling changes
  - rock de-ownership
  - near-camera fade
  - occupancy bands
  - shell/floor/side lanes
  - depth-group travel fields
  - compact target-space blobs
  - broad corridor target-space
  - separate raw-progress travel timing
- This file is the most contaminated file and the clearest reset target.

### `src/flow-engine/app.js`
- Gained explicit hold-space syncing and post-freeze travel-basis syncing for the experimental late renderer path.
- Owns the current `setHoldSpace(...)` / `setTravelDirections(...)` handshake with the experimental renderer branch.
- Cannot safely stay on the new version if `particleRenderer.js` is reset to `HEAD`.

### `src/flow-engine/engineBridge.ts`
- Gained the renderer-owned post-freeze track used by the experiments.
- Most recent addition was `postFreezeRawProgress` to separate travel timing from eased release timing.
- Current bridge timing is part of the failed experiment chain and is coupled to the current renderer branch.

### `src/flow-engine/conf.js`
- Carries the post-freeze track fields used by the experiment cluster.
- Most recent addition was `postFreezeRawProgress`.
- Must stay consistent with `engineBridge.ts` and `particleRenderer.js`.

## Ideas That Are Safely Discarded
- Further tuning of local direction fields
- Near-camera sphere fade / visibility suppression
- Occupancy bands and wave masks
- Rock de-ownership as the primary lever
- Shell/floor/side lane composition
- Compact lead/mid/tail blob targets
- Flat forward corridor targets
- Triple-eased motion stack with squared position travel

## Few Reliable Findings That Remain
- The repeated failures are macro-read failures, not tiny coefficient misses.
- The late branch kept mutating between wrong motifs:
  - pullback
  - front sheet
  - horseshoe
  - blob
  - slab
- `particleRenderer.js` is the main owner of the failed post-freeze experiments.
- `app.js`, `engineBridge.ts`, and `conf.js` are only reset candidates because they were wired to support that renderer experiment chain.
- A clean restart should begin from a coherent baseline, not from partially reverted late-branch interfaces.

## Reset Principle
- Reset only the smallest coherent experiment cluster.
- Do not reset `SpatialChamber`, `convergence/*`, `FlowEngineHost`, `backgroundGeometry`, or unrelated docs/assets unless they are proven to exist only for the failed post-freeze branch.
