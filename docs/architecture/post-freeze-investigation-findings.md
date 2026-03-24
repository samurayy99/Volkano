# Post-Freeze Investigation Findings (2026-03-24)

## Status: corrected after follow-up audit

This note supersedes an earlier draft that overstated the `dt` bottleneck and assumed the temporary `?particleDebug=` visualization was still present in the live workspace.

Current corrected status:

- the post-freeze investigation is partially run, not untouched
- prior debug videos from a Claude session reported useful evidence
- those temporary debug hooks are **not** present in the current `particleRenderer.js`
- the strongest current diagnosis is **renderer burial by the settled-floor path**, not `dt` alone

## The Core Problem

After convergence freeze (`progress = 100`), materially different passes kept collapsing to the same browser read:

- earlier onset timing
- pre-proof renderer composition
- survivor heat retention
- survivor scale boost
- seam absorption pull

Observed result stayed effectively the same:

`waves / settle -> dark floor carpet -> DOM proof`

## What Is Actually Established

### 1. The active late-frame path is floor-owned

In the current runtime:

- `settleMix` is generated in `convergence-progress-map.ts`
- `engineBridge.ts` writes it into `conf.postFreezeSettleMix`
- `mlsMpmSimulator.js` applies that as a downward settle field
- `particleRenderer.js` consumes the same signal as `convergenceSettle -> materialSettle -> settledFooting`

`settledFooting` is then the dominant late-frame visual owner:

- crust formation
- burial/lift
- width/height/length compression
- orientation
- proof darkening
- glow suppression

This means many upstream differences can still collapse into the same visible floor-carpet image once `settledFooting` saturates.

### 2. Thermal extinction reaches the frame only indirectly

`convergenceThermalExtinction` is bridge-owned, then simulator-owned.
It damps ignition, flare, hot layers, and final color in `mlsMpmSimulator.js`.
There is no dedicated renderer-side thermal branch that reasserts late survivors as a distinct image state.

So "survivor heat" must survive two filters:

1. simulator cooling/extinction
2. renderer darkening/crust/glow suppression

### 3. Seam absorption is late, simulator-only, and horizontal

`seamAbsorption` is created in `engineBridge.ts` from:

`ease01((settleMix - 0.9) / 0.1)`

So it starts only after deep settle is already in control.

It is then consumed only in `mlsMpmSimulator.js` as a pull toward seam center in X/Z.
There is no matching renderer-owned seam-absorption branch.

That makes the likely visible result:

- same carpet first
- slight recentering later

not a new image state.

### 4. The current workspace has no active pre-proof prototype branch

The earlier pre-proof docs describe a real historical branch (`preProofPrototypeMix`, `prototypeMass`, `prototypeVoid`, etc.).
That branch is **not active in the current live renderer code**.

So future sessions must not assume that an existing prototype/pre-proof path is still wired and ready to debug.

## Corrected Bottleneck Assessment

### Primary bottleneck: renderer burial

The late composite is currently owned by the settled-floor renderer path.
That is the best explanation for why very different passes still converge to the same image.

### Secondary bottleneck: thermal window is already mostly dead by freeze

From `convergence-progress-map.ts`:

- `settleMix = smoothstep(progress, 55, 88)`
- `thermalExtinctionMix = smoothstep(progress, 80, 98)`
- `freezeMix = smoothstep(progress, 98, 100)`

By freeze completion, heat is already heavily extinguished.
So any effect that waits until or after freeze is starting from a weak thermal signal.

### Secondary bottleneck: seam pull arrives too late to claim ownership

Because seam absorption ramps only after deep settle, it is trying to modify a frame that the carpet already owns.

### Not established as primary: `dt` alone

The earlier draft claimed `dt` was the primary bottleneck.
That is too strong.

Reduced `dt` may weaken simulator-side velocity forces, but the later video/debug reading and follow-up runtime tracing point more strongly to:

- signal burial in the renderer
- late activation timing
- absence of a distinct late-stage visual owner

Treat `dt` as a contributing factor, not the canonical root cause by itself.

## Prior Debug-Video Findings Worth Keeping

The quoted Claude session reported three temporary debug-video reads:

### `?particleDebug=settled`

- play: mostly low settle
- convergence/freeze: settle ramps across the mass
- freeze/proof: settled signal saturates into a broad carpet

### `?particleDebug=heat`

- play: strong heat
- convergence: heat falls visibly
- freeze/proof: heat is nearly gone except for weak remnants

### Composite

- the image still resolves to a dark red/brown/black floor mass

Those findings match the later code tracing:

- floor ownership dominates
- heat is largely extinguished before proof

Important correction:
the temporary `?particleDebug=` visualization is **not** in the current workspace and must not be assumed available without rebuilding it.

## Failed Approaches (do not blindly retry)

| Approach | Corrected reading |
|----------|-------------------|
| Separate InstancedMesh embers | Different material/render world; never owned the same image language as the MLS-MPM body |
| Survivor particles kept hot | Heat was already being extinguished and then visually buried by the settled/crust path |
| Survivor scale boost | Scale-only change could not beat the renderer's floor-owned normalization |
| Seam absorption pull | Late, simulator-only, horizontal effect; too little visual leverage against the already-owned carpet |
| Pure timing advance without a distinct visual owner | Moved onset inside the same late-frame regime instead of creating a new image state |

## Critical Constraints

### Particle struct remains sacred

The particle StructuredArray stride is fixed.
Do not add ad-hoc survivor/debug fields into the particle struct.

### TSL diagnostic rules

- temporary debug visualization must use TSL/WGSL-safe ops
- do not assume `select()` + boolean chains are safe
- always verify that particles still render after any shader debug pass

### Debug-status rule

If a future session relies on debug visualization, first confirm the hooks actually exist in the current workspace.
Do not inherit assumptions from a past session transcript.

## What a New Session Should Do First

1. Treat late-frame ownership as the primary audit target, not aesthetics.
2. Verify which signals currently have active renderer consumers and which are simulator-only.
3. If debug instrumentation is needed, rebuild it as a temporary investigation path and document it as temporary.
4. Do not start from "make the effect stronger" until it is proven whether the signal is missing, late, or visually buried.
