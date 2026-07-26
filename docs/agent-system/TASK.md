# ACTIVE TASK: DESIGN 01 — OPENING COMPOSITION

**Assigned:** 2026-07-26 by Volkan, after the Proof A.1 video verdict.
**Direction:** `docs/product/design-01-living-surface.md`
**Words:** `docs/product/studio-content-contract.md` — binding, already implemented in
`src/app/studio/content.ts`. Do not write a single new visible string.
**Route:** `/` — the real site (`StudioExperience`), design `design-01`.
The lab at `/proto/phase-field` stays exactly as it is. It is the instrument, not the
product. Do not delete it, do not extend it.

## WHY THIS NOW

Proof A.1 passed on video. Volkan's verdict, binding:

- **CURL wins** — motion reads organic and fluid instead of rasterised.
  The 4× noise cost is real and unproven on device.
- **COHERENCE wins clearly** — dense reflecting core plus fleeting periphery creates
  attention and hierarchy. *"LENOX becomes recognisable through behaviour, not through
  a figure."*
- **BILLBOARD wins clearly** — shards read as plastic chips. Billboards read as heavy
  silver / mercury droplets, a different quality class.

The proof loop is closed. **No further proof.** Not Proof B, not motion blur, not a
density study, not a performance study. The next artefact is a website, not evidence.

## SCOPE — three beats, and where it stops

One continuous sequence on the real route. Nothing else on the page changes.

```
BEAT 1 — ARRIVAL
  Black room. Living ambient field. Hero copy from the contract.
  No debug controls, no lab HUD, no sliders, no FPS readout.

BEAT 2 — ATTENTION
  Pointer influences the field. Local matter organises.
  LENOX becomes perceptible as presence.
  No figure, no face, no droplet experiment as subject matter.

BEAT 3 — FIRST SCROLL
  The field does NOT shrink into a window.
  The matter opens a corridor in space.
  The next section arrives: THE STUDIO IS THE DEMO.
```

**It stops the moment chapter 02's headline has landed.** Not the rest of `principle`,
not the design switch, not chapters 03–05. Those keep whatever they do today.

## BEAT 3 — the corridor, defined so it cannot be built wrong

This is the beat that will be built cheaply and wrongly if it is left to interpretation.

**Forbidden — this is what "shrinking into a window" means:**
- scaling, insetting, masking or transforming the canvas element
- fading the field out and sliding a DOM section over it
- boxing the renderer into a frame while content scrolls past

**Required:** the canvas stays full-bleed for the whole sequence. The opening is
authored **in the solver's target field**, not in CSS. Matter moves aside — laterally,
with its own inertia — and the chapter-02 copy appears *inside* the void the matter
made. Camera movement forward into that corridor is allowed and is not the same thing
as the canvas getting smaller.

The mechanism already exists: `carvePopulationSlit({ splitPush, gapWidth })` in
`mlsMpmSimulator.js` pushes the population apart and cuts a gap into it. The corridor
is that mechanism driven continuously by scroll instead of fired once. Reuse it or
extend it; do not invent a second one.

Driven by `studioDirector` progress → discrete engine intent. The engine owns the
easing. No second scroll authority, no per-frame React writes.

## THE APPROVED ENGINE STATE MUST REACH PRODUCTION

Today `coherenceRecruit`, `coherenceMotionT`, `coherenceCurlT`, `coherenceMaterialT`,
`phaseFieldNormalT` and `primitiveT` are 0 outside the lab, and their setters are
lab-only calls. The approved default has to become the studio path's real state:

```
BILLBOARD + CURL + COHERENCE + STUDIO HDRI
```

Two consequences to handle honestly:

1. **`phaseFieldNormalT` is no longer a phase-field switch.** Under BILLBOARD the
   corrected particle normal is the production normal. Rename it for what it is and
   make sure the studio path uses it. The pre-existing bug where shards were lit with
   un-rotated normals disappears with the primitive — do not separately "fix" the
   shard path.
2. **The verdict was recorded at 4 096 particles, DPR 1, 720p.** Production runs
   denser and sharper. Confirm the approved look survives at production density and
   report what you see. If it does not, say so — do not silently retune the material
   Volkan just approved.

## MUST NOT HAPPEN

- No new visible copy. The contract is the source; `content.ts` already implements it.
- No mascot, face, body, arms, or authored character asset. LENOX is behaviour.
- No second renderer, second state machine, second scroll authority.
- No per-frame React writes into the engine.
- No touching chapters 03–05, `/ai-systems`, or `/proto/opening`.
- No Proof B, no motion blur, no performance work, no density study.
- No commit, push, deploy or dependency change without Volkan's explicit go.

## REGISTRY CORRECTION

`designRegistry.ts` still describes `design-01` as `GRAVITY` with
`worldMedia: "film"` — the retired reef/film direction. CLAUDE.md already states
design 01 is fully computed and does not use the media pipeline. Redefine the entry
in place: label `LIVING SURFACE`, `worldMedia: "none"`. `?design=design-01` stays
valid. Do not add a fourth design.

## ACCEPTANCE

Momentum mode: code everything codable, then one joint session. No per-step gates.

Volkan judges on video. The gate is not "it runs" — it is whether the three beats read
as one continuous arrival on the real route.

Built in from the start, tested at the end, not retrofitted:
- desktop 1440×900
- mobile 390×844 as its own composition, not a squeezed desktop
- reduced motion — the sequence must resolve to a still, legible arrival
- console clean, no horizontal overflow

Real-device iPhone Safari and the curl cost on device remain open from Proof A.1 and
are part of the final session, not a reason to stop building now.
