# Rift Reclaim Sequence — Design Spec

## Status: Priority 1+2 implemented — awaiting video proof

## Problem

After convergence freeze, the chamber should feel visibly cleared before proof text appears. Currently it doesn't. The settle path (`settledFooting`) saturates the renderer into a dark floor carpet, thermal extinction kills all visual energy, and seam absorption has no renderer presence. The result: every post-freeze variation collapses to the same dark carpet → DOM proof transition. The proof lands on a full chamber, not a cleared one.

Prior failed approaches (documented in `post-freeze-investigation-findings.md`): survivor heat retention, survivor scale boost, seam absorption pull timing, separate InstancedMesh embers, pure timing advance. All failed because they modified signals that the settled-floor renderer path buries.

## Goal

The volcano takes its matter back. The chamber clears. What remains is the verdict.

```
Enter
→ convergence: mass slows, compresses, heat dies          [WORKS TODAY]
→ wave tail: mass settles toward floor                     [WORKS TODAY]
→ reclaim onset: floor mass drifts back toward rift        [PRIORITY 1]
→ absorption: particles compress and vanish into the rift  [PRIORITY 1+2]
→ quiet beat: chamber is visibly empty, 200-400ms hold     [PRIORITY 3]
→ proof: "I BUILD SUPA STUFF" on cleared space             [WORKS TODAY]
```

Emotional read: directional reclaim, not a fade-out. Matter flows back toward its source and is consumed. The chamber is left clean.

## Success Criteria

1. **Video proof of clearing**: side-by-side before/after. The chamber must be visibly freer before proof appears.
2. **Directional read**: matter moves toward the rift (back wall / vent center), not uniformly fading.
3. **No regression**: source stage, thermal ramp, convergence slowdown, and proof text all untouched.
4. **No new layers**: everything lives inside the existing particle system + renderer. No new meshes, materials, or compute passes.

## Non-Goals

- Thermal ramp changes (LOCKED)
- Particle typography or logo formation
- New sequence engine or state machine
- Changes to SpatialChamber.tsx or convergence controller
- Capture-count metrics gating (too fragile for run-to-run variance)
- AuthoredTakeoverLayer revival (wrong visual language)

---

## Priority 1: Mass Clearing

**The only question: does the chamber become visibly freer?**

### 1A: Earlier and deeper settle suppression

**File:** `src/flow-engine/engineBridge.ts` — `applyConvergenceSignals()`

Current state:
```ts
const environmentalReclaimMix = this.ease01(
  (settleMix - FlowEngineBridge.AUTHORED_TAKEOVER_THRESHOLD) / 0.18,
);
// AUTHORED_TAKEOVER_THRESHOLD = 0.62
conf.postFreezeSettleMix = settleMix * THREE.MathUtils.lerp(1, 0.22, environmentalReclaimMix);
```

Change:
- Lower threshold from 0.62 to ~0.42 — reclaim starts overlapping with late settle, not waiting for it to finish
- Deeper suppression target from 0.22 to ~0.06 — settle effectively releases the floor so absorption can own the frame
- Widen the ramp window from 0.18 to ~0.28 — smoother handoff, less abrupt

The goal is not to prevent settling. Settling happens first and forms the carpet. Then reclaim takes over and the carpet dissolves back toward the rift. The overlap is the key — reclaim shouldn't wait for settle to fully saturate.

### 1B: Stronger and more directional simulator pull

**File:** `src/flow-engine/mls-mpm/mlsMpmSimulator.js` — g2p kernel, seam absorption section

Current state: `seamPull` maxes around `2.2`, proximity boost from 34→3 grid units. Pull is horizontal (XZ toward vent center), with a separate vertical reclaim toward `seamBodyCenter`.

Changes:
- Increase `seamPull` peak from 2.2 to ~4.0-5.0 during full reclaim — particles must actually clear, not just drift
- Add a vertical pull component toward vent Y (not just `seamReclaimTargetY`) — the mass should lift off the floor toward the rift, not slide horizontally along the carpet
- Lower the capture threshold from 0.42 to ~0.30 — particles get consumed sooner, reducing lingering mass

**Success metric:** Not stronger motion, but less surviving visible chamber mass. If particles move faster but the chamber still looks full, the change failed. Optimize for empty frame area, not velocity.

### 1C: Settle field yields to reclaim field in the simulator

**File:** `src/flow-engine/mls-mpm/mlsMpmSimulator.js` — g2p kernel, settle section

Current state: `settleSuppression` from `seamReclaimField * 0.985` — the settle downward force is suppressed where reclaim is active.

Change:
- Increase suppression factor so that in the reclaim zone, downward settle is nearly zero
- This prevents the solver from fighting itself: settle pushes down while reclaim pulls toward the rift

---

## Priority 2: Renderer Absorption Read

**Only if it supports the clearing read. Not as standalone beauty.**

### 2A: Absorption proximity varying

**File:** `src/flow-engine/mls-mpm/particleRenderer.js` — position node

New varying `vAbsorptionProximity` computed from particle position relative to vent center:
```
absorptionProximity = seamAbsorption * smoothstep(riftRadius, 0, distanceToVent)
```

This drives:
- **Scale compression** (primary): `renderScale *= lerp(1.0, 0.12, absorptionProximity²)` — particles shrink as they approach the rift, visually disappearing before capture
- **Orientation** (secondary, only if needed): blend particle direction toward rift direction as proximity increases — only implement if scale compression alone doesn't produce a directional read

### 2B: Minimal emissive lift (conditional)

**File:** `src/flow-engine/mls-mpm/particleRenderer.js` — fragment/emissive section

Only if the clearing motion is not self-reading without it. If dark particles moving toward the rift already read clearly, skip this.

If needed: a small emissive addition (~0.04-0.08 intensity) using the existing `ember` color, modulated by `vAbsorptionProximity`. Purpose: make the direction of mass withdrawal visible in the frame. Not a glow effect — a readability aid.

### 2C: What NOT to do in the renderer

- No new crust/floor path for absorption (reuse existing crustBody/crustHeat language)
- No new debug visualization (existing `?particleDebug=seamPull` covers this)
- No opacity/transparency tricks (particles shrink to zero, they don't fade)

---

## Priority 3: Quiet Hold Timing

**Timer-based. No metrics gates.**

### 3A: Proof gate waits for visual clear

**File:** `src/flow-engine/engineBridge.ts` — `updateProofReady()`

Current state: quiet chamber must complete its delay + duration + hold before proof fires. This is already timer-based, which is correct.

Tuning needed:
- `QUIET_CHAMBER_DURATION` may need to increase from 0.2s to ~0.35-0.5s — enough time for the reclaim to visually clear the chamber
- `QUIET_CHAMBER_PROOF_HOLD` may need to increase from 0.18s to ~0.25-0.35s — the empty chamber should hold long enough to register as a moment

These are tuning values, not architectural changes. Adjust based on video proof.

### 3B: Exposure dim during quiet beat (optional)

**File:** `src/flow-engine/engineBridge.ts` — `applyConvergenceSignals()`

During the quiet chamber phase, reduce exposure slightly via `setLook`:
- Environment intensity: 0.22 → 0.14
- Exposure: 0.58 → 0.42

This makes the cleared chamber feel darker, more compressed, more anticipatory. The proof text then lands in a quieter visual space.

Only if the cleared chamber without this still feels too neutral.

---

## Priority 4: Re-Ignition Tuning (only if needed)

**Only if priorities 1-3 produce a cleared chamber that feels too dead.**

### 4A: Simulator-side heat injection in reclaim field

**File:** `src/flow-engine/mls-mpm/mlsMpmSimulator.js` — g2p kernel, heat assignment

Particles within the reclaim field get a small heat addition (~0.06-0.12) that partially counteracts thermal extinction. This would make the rift consumption visible as a faint warm flow, not invisible dark dust.

This is explicitly last priority. The clearing must work first. Beauty comes after.

---

## Architecture Rules

### Ownership boundaries
| Concern | Owner | Do NOT touch |
|---|---|---|
| Mass clearing force | Simulator (g2p) | Renderer position |
| Absorption visual read | Renderer (position + fragment) | Simulator heat/color |
| Timing / transitions | Bridge (engineBridge.ts) | SpatialChamber.tsx |
| Proof text | DOM / CSS | Particle system |
| Thermal ramp | LOCKED | Everything |

### Implementation constraints
- No new `conf` properties — reuse `seamAbsorption`, `quietChamberMix`, `postFreezeSettleMix`
- Avoid new simulator uniforms unless they materially simplify the reclaim/clearing pass
- No changes to particle struct (stride is sacred)
- No changes to convergence state machine or phases
- Each priority is independently shippable and testable via video

### Verification method
Each priority must produce a screen recording showing the before/after difference. If the difference is not "eindeutig sichtbar" (clearly visible), the change gets reverted. No theoretical correctness without visual proof.

---

## Files Touched

| Priority | File | Change scope |
|---|---|---|
| 1A | `src/flow-engine/engineBridge.ts` | ~8 lines in `applyConvergenceSignals` |
| 1B | `src/flow-engine/mls-mpm/mlsMpmSimulator.js` | ~12 lines in g2p seam section |
| 1C | `src/flow-engine/mls-mpm/mlsMpmSimulator.js` | ~4 lines in g2p settle section |
| 2A | `src/flow-engine/mls-mpm/particleRenderer.js` | ~15 lines in position node |
| 2B | `src/flow-engine/mls-mpm/particleRenderer.js` | ~8 lines in fragment/emissive |
| 3A | `src/flow-engine/engineBridge.ts` | ~4 lines timing constants |
| 3B | `src/flow-engine/engineBridge.ts` | ~6 lines in convergence signals |
| 4A | `src/flow-engine/mls-mpm/mlsMpmSimulator.js` | ~6 lines in g2p heat section |

Total: ~60 lines across 3 files. No new files. No new dependencies.

---

## Sequence of Work

1. Implement Priority 1 (A+B+C together — they're coupled)
2. Record video. Is the chamber visibly freer? If not, debug before proceeding.
3. Implement Priority 2A (scale compression + orientation)
4. Record video. Does the reclaim direction read? If yes, skip 2B.
5. Implement Priority 3A (timing tuning)
6. Record video. Does the quiet beat feel authored?
7. Only then consider 3B and 4A based on visual evidence.
