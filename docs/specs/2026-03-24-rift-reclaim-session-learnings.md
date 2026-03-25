# Rift Reclaim Sequence — Session Learnings (2026-03-24)

## Status: UNRESOLVED — chamber clearing not yet working

The reclaim sequence (post-freeze chamber clearing before proof text) was the focus of an intensive session. Multiple approaches were tried. None achieved the goal. This document captures everything learned so the next session doesn't repeat the same dead ends.

---

## The Goal (agreed with user + ChatGPT advisor)

```
Enter
→ convergence: mass slows, compresses, heat dies          [WORKS]
→ wave tail: mass settles toward floor                     [WORKS]
→ floor deposit: brief impact read, NOT permanent carpet   [PARTIALLY WORKS]
→ reclaim: mass flows back toward rift directionally        [NOT WORKING]
→ quiet chamber: visibly empty, 200-400ms hold             [NOT WORKING]
→ proof: "I BUILD SUPA STUFF" on cleared space             [WORKS]
```

Creative direction (locked consensus):
- **"Keep the floor event, kill the floor ownership"** — carpet is a brief moment of impact, not the final state
- **violence → consequence → withdrawal → verdict** — not violence → pile of leftovers → cleanup → text
- No black-hole spiral show, no shader wipe, no radial dissolve
- Must read as **material reclaim by the rift**, not a VFX reveal

---

## What Was Proven: The Simulator CANNOT Clear the Floor Carpet

This is the single most important finding. Every simulator-based approach failed for the same structural reason.

### Root Cause: MLS-MPM Velocity Pipeline

In the g2p kernel, the velocity pipeline per frame is:

```
1. particleVelocity = vec3(0)             ← RESET to zero every frame
2. += weightedGridVelocity (from p2g→g2p)  ← MLS-MPM grid transfer
3. += gravity * dt
4. -= noise * dt
5. += convergencePull * dt
6. += settlePush (WITHOUT dt)              ← ~0.15/frame downward
7. += riftPull * dt                        ← ~0.017/frame toward rift
8. += seamReclaimPull * dt
9. *= particleMass
10. *= slowdownDamping (0.994)
11. *= freezeDamping (0.94)
12. *= absorptionDamping (0.984)
13. position += velocity * dt
```

**Step 1 is the killer.** Velocity resets every frame and is rebuilt from the grid. All forces added in steps 3-8 are overwritten by the grid transfer in the next cycle. Only forces that match or exceed the grid velocity magnitude have lasting effect.

### Why dt-multiplied forces fail

During post-freeze:
- `speed = 0.12` → `dt = interval * 6 * speed = 0.0167 * 6 * 0.12 = 0.012`
- Rift pull at floor distance (22 units): `(32/22)² * 0.68 * 0.012 = 0.017/frame`
- Freeze damping removes 6%/frame, absorption damping removes 1.6%/frame
- Grid viscosity in dense carpet regions adds further resistance
- **Net effect: ~0.017/frame input vs 7.5% velocity loss → carpet barely moves**

### Why settle works but rift pull doesn't

The settle force (line 385-391) is applied **WITHOUT dt multiplication**:
```javascript
particleVelocity.addAssign(vec3(0, -0.28, 0).mul(postFreezeSettleMix).mul(settleBand)...);
```
At ~0.15/frame, this is ~9x stronger than the rift pull. It pushed particles down effectively. But the rift pull at ~0.017/frame cannot undo what settle created.

### Why "unfreeze during reclaim" didn't help

We tried ramping speed back to 0.52 and reducing freezeDamping during reclaim. This should have made dt 4.3x larger. But the user saw NO visible difference. The grid velocity (step 2) still dominates, and the dense carpet acts as a viscous blob through the grid transfer.

---

## Failed Approaches (Do Not Retry)

### 1. Stronger inverse-square pull (multiple attempts)
- Increased event horizon 22→32, multiplier 0.52→0.68
- Result: upper particles vanish instantly, floor carpet unchanged
- **Why:** inverse-square creates binary force profile (strong close, weak far)

### 2. Floor-lift force without dt
- Applied `~0.20/frame` direct velocity toward rift for floor particles
- Correct force scale, but: band too wide (affected mid-height particles), carpet too viscous
- **Why:** even at the right magnitude, the MLS-MPM grid coupling resists individual particle motion in dense regions

### 3. Speed/freeze unfreeze during reclaim
- Ramped speed 0.12→0.52, freeze damping 0.94→0.985
- Result: NO visible difference
- **Why:** grid velocity pipeline dominates; dt changes don't overcome grid coupling

### 4. Timing changes (RECLAIM_DELAY, RECLAIM_DURATION)
- Changed delay 0.42→0.08, duration 1.8→2.8
- Result: NO visible difference in clearing
- **Why:** timing doesn't change force magnitude; the carpet doesn't move regardless of when or how long you pull

### 5. Base minimum inward drift (constant + inverse-square)
- Added 0.18 constant drift on top of inverse-square
- Result: NO visible difference (0.18 * dt = 0.002/frame — negligible)

### 6. Renderer expanding shrink wave (attempted but broken)
- Concept: `shrinkWaveFront = seamAbsorption * 30.0` expands from rift outward
- Particles inside wave compress via `pow(absorptionProximity, 3.5)`
- **Status: NOT WORKING due to shader compilation issues**
- Bug 1: `smoothstep(high, low, x)` is undefined behavior in WGSL (produces NaN)
- Bug 2: `max()` global function not available in renderer context (use `.max()` node method)
- Bug 3: Even after fixing direction and max(), particles still invisible — likely another TSL compilation issue not yet identified
- **The CONCEPT is correct but the IMPLEMENTATION needs debugging in a fresh session**

---

## The Correct Architecture (Agreed Consensus)

### Renderer must own the clearing visual

From the ownership map:
```
| Concern                | Owner                           |
|------------------------|---------------------------------|
| Mass clearing force    | Simulator (g2p)                 |
| Absorption visual read | Renderer (position + fragment)  |
```

The simulator provides a subtle directional motion hint (upper particles drift toward rift). The renderer owns the actual chamber clearing via an expanding compression wave.

### Expanding shrink wave (the untested correct approach)

```
Current (working but insufficient):
  absorptionProximity = seamAbsorption * smoothstep(18.0, 2.0, riftDist)
  → Fixed 18-unit radius. Floor at 22+ units never affected.

Needed:
  waveFront = seamAbsorption * 30.0    // expands 0→30 over reclaim
  absorptionProximity = f(riftDist, waveFront)  // 1 inside wave, 0 outside
  → At seamAbsorption=0.75: wave reaches floor (22.5 units)
  → At seamAbsorption=1.0: entire chamber cleared (30 units)
```

Combined with:
- `pow(absorptionProximity, 3.5)` — particles stay visible until wave reaches them, then compress fast
- Ember glow `pow(proximity, 2.0) * 0.12` — brief heat flash at the wave front
- 6-unit transition band for smooth compression, not hard plop

### TSL implementation pitfalls to avoid

1. **`smoothstep(a, b, x)` in WGSL requires `a < b`** — inverted args produce NaN
2. **Use `.max()` node method, not `max()` global** — global may not be imported in all files
3. **When waveFront = 0 (play state), avoid degenerate smoothstep** — multiply result by `seamAbsorption` as safety gate
4. **Test with a hard-refresh** — WebGPU shaders compile at init, HMR may not fully reload them

---

## Current State of the Code (what's changed from last git commit)

### `src/flow-engine/engineBridge.ts`
- `RECLAIM_DELAY`: 0.42 → **0.08** (reclaim starts almost immediately after freeze)
- `RECLAIM_DURATION`: 1.8 → **2.8** (slower ramp for visual wave)
- `reclaimUnfreeze` / `effectiveFreeze` code was added then **removed** (cleaned up)
- Reclaim is driven by `postFreezeElapsed` timer, NOT `settleMix` (this was a critical earlier fix)

### `src/flow-engine/mls-mpm/mlsMpmSimulator.js`
- Inverse-square cap: 10.0 → **4.0** (prevents instant absorption near rift)
- Floor-lift code was added then **removed** (cleaned up)
- All other reclaim infrastructure (rift pull, seam reclaim pull, capture zones) unchanged

### `src/flow-engine/mls-mpm/particleRenderer.js`
- Scale compression exponent: 2.2 → **3.5** (steeper late shrink)
- Ember glow: `proximity * 0.06` → **`pow(proximity, 2.0) * 0.12`** (distance-based, only near rift)
- Absorption proximity: **reverted to original** fixed-radius `smoothstep(18.0, 2.0, riftDist)` (wave approach was broken)

---

## Cherry Picks from CodePen Analysis (validated, not yet applied)

Five CodePen snippets were analyzed. Consensus picks:

| Pick | Source | Status | Notes |
|------|--------|--------|-------|
| Swirl/tangential force | Black hole `omega` + Star `angularSpeed` | **Deferred** | ChatGPT vetoed as too risky for now. Plan B only if needed. |
| Base inward drift | Star system `+0.1` floor | **Tried, failed** | dt scaling makes it negligible |
| Steeper scale curve | Meteorite bezier | **Applied** | pow 2.2→3.5, working |
| Ember distance shift | Meteorite dark→bright + Star color-by-distance | **Applied** | pow(x,2)*0.12, working |
| Exponential force ramp | WebGL black hole mass easing | **Deferred** | Not needed until base mechanics work |

---

## Recommended Next Steps

### 1. Debug the renderer shrink wave (highest priority)

The expanding wave concept is architecturally correct. The implementation had three bugs (smoothstep direction, max() import, unknown third issue). A fresh session should:

1. Start from the current working renderer code
2. Add the wave logic step by step, testing after each line
3. Use browser console to check for WGSL compilation errors
4. Hard-refresh after every shader change (don't trust HMR)

### 2. Consider `select()` / conditional instead of smoothstep

If smoothstep continues to cause WGSL issues, try:
```javascript
const insideWave = riftDist.lessThan(shrinkWaveFront);
const waveBlend = shrinkWaveFront.sub(riftDist).div(float(6.0)).clamp(0, 1);
const absorptionProximity = select(float(0), waveBlend, insideWave)
    .mul(this.uniforms.seamAbsorption);
```

### 3. Don't touch the simulator forces

The simulator rift pull is fine as a subtle directional hint. Don't try to make it stronger — the grid physics won't allow it. Let the renderer own the clearing.

### 4. Test the wave front speed

Once the wave works, tune:
- Wave radius multiplier (currently 30.0 — may need 25-35)
- Transition band width (currently 6.0 — may need 4-8)
- Scale compression target (currently 0.1 — may need 0.0 for full disappearance)
- Ember glow intensity at the wave front

### 5. Timing may need revisiting

Current `RECLAIM_DELAY=0.08` may be too fast — the "brief floor impact" moment gets cut short. Consider 0.3-0.5s to let the carpet register as an impact before the wave starts.

---

## Key Principles for Next Session

1. **The simulator owns motion, the renderer owns the clearing visual** — don't fight this
2. **Test every TSL change with a hard browser refresh** — WebGPU shader compilation is not HMR-safe
3. **One change at a time, video after each** — no bundling multiple experiments
4. **Trust the browser, not the theory** — if it doesn't look different, it isn't different
5. **The thermal ramp is LOCKED** — do not reopen color tuning
6. **The carpet is a moment, not a state** — floor event yes, floor ownership no
