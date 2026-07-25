# ACTIVE TASK: PROOF A — PHASE FIELD MATERIAL STATES

**Assigned:** 2026-07-25 by Volkan, after the team round on Design 01.
**Direction:** `docs/product/design-01-living-surface.md` (read it first).
**Route:** `/proto/phase-field` — a new route. Do **not** extend `/proto/opening`.

## WHY THIS FIRST

The opening choreography cannot be designed for a material that does not exist yet.
P1 proved the transition is technically affordable (9.3 ms worst frame) and failed
visually — partly because there was no defined material to open. Everything else in
the build order waits on this.

## THE BINDING FRAME

```
no body            no arms              no face
no mascot          no octopus           no robot
no authored character asset             no GLB handoff
no character representation of any kind
```

**One solver, one particle population, one material language, multiple force and
target states.** The MLS-MPM simulation and its ray-based pointer path are preserved.
The field-only runtime on `origin/codex/living-agency-v1` is rejected.

LENOX is a **directed condensate state** inside the population — never an object
placed in front of a background.

## SCOPE

Three states of the same particles, visibly different by **behaviour**:

```
AMBIENT    passive. distributed, slow irregular drift, no visible loop.
           returns to rest. moves by itself when nobody touches it.

ATTENTION  the field notices the visitor. local response within ~150 ms of the
           first pointer or touch, the rest follows. velocity matters: fast tears,
           slow pushes.

LENOX      directed. local density rises, motion gains intent, matter connects
           optically. attentive without eyes.
```

Plus the material question that decides everything else: **what is the substance?**
Show the same matter in a small number of temperatures so Volkan can choose on moving
material, not on description. Ultramarine · oxide/amber · dark mineral are the
starting candidates; dark is permitted for design 01 because 02 and 03 carry the
bright register.

### The environment map — A/B this, it is not a detail

K4 (Fresnel + refraction + Beer-Lambert) needs something to refract. What the matter
reflects **is** the environment map, and that is where expensive and cheap are decided.

The engine currently loads `autumn_field_puresky_1k.hdr` — a meadow under a blue sky,
left over from the fluid demo this engine grew out of. `voidEnvironment.js` already
documents why that was wrong: every highlight was a field, which is why the silver
never read as material. It generates an authored black studio instead.

Test both against each other in the material pass:

```
A  voidEnvironment.js      procedural, zero bytes, authored reflection bands
B  Poly Haven studio HDRI  polyhaven.com — CC0, commercial use, no attribution
```

**1K, prefiltered to a small cubemap.** Reflections do not need resolution, and a 4K
or 8K file would destroy the one argument this hero has: that it is fully computed and
therefore instant on a phone over mobile data. Poly Haven's *surface* textures — wood,
brick, concrete, fabric — have no use here; we have no surfaces, we have particles.

## MUST PROVE

1. Three states, unmistakably different, same particles.
2. No mascot, no blob, no accidental face.
3. Material reads as substance, not dust — light travelling through density.
4. Pointer interaction stable; the field alive when untouched.
5. A readable concentration that **holds and breathes** — the project's central
   unproven risk.
6. One environment map chosen against the other on moving material, with the total
   byte cost of the pick stated.

## OUT OF SCOPE

Opening choreography. Journey wiring. Target maps. Diagnosis. Chapter work of any
kind. Six render passes — add passes one at a time with a measured cost.

## DONE WHEN

Video to Volkan. Judged on moving material, never on stills or a written report —
stills are exactly how P1's incoherent wake sequence was missed.

Particle counts are adaptive tiers determined by visual testing. No fixed number is
specified here.

## AFTER THIS (do not start early)

```
Proof B — CONDENSATE   density → optical connection → attentive form → clean release
Proof C — OPENING      the validated material opens into the first story scene
then     TARGET MAPS, then the journey
```

## BOUNDARIES

One writer at a time. Short isolated branch for this proof with small commits — the
earlier lesson was uncommitted work, not branches as such. No commit, push, deploy or
dependency change without Volkan's explicit approval.


---

# Historical Task: LENOX Endfassung — Body + GRAVITY

> **Superseded as the active product task on 2026-07-19.** The engine work below remains a reusable runtime baseline, but the public experience is now governed by `docs/product/volkan-studio-master-experience.md`: a complete studio journey with early Selected Work, two shared-content realities and no isolated `YOU vs LENOX` choice. Current implementation state is recorded at the top of `docs/agent-system/CURRENT.md`.

**Assigned:** 2026-07-17. Codex `gpt-5.6-sol` (high reasoning) won the four-way concept challenge and leads the final version as sole runtime writer. Fable accompanies (creative direction, this briefing, final review). Volkan gives final visual acceptance.
**Supersedes:** the 2026-07-16 Collapse task — its scope is absorbed here. `docs/product/gravity-creative-contract.md` still binds the collapse beats. Codex's winning synthesis paper (2026-07-17 chat round) is the governing design document; the decisions below are binding extracts.

## MOMENTUM PROTOCOL (Volkan's explicit instruction)

Build through the full scope in one sustained run. **No intermediate acceptance gates, no per-step video proofs, no verification pauses every few meters.** Code everything that can be coded; author self-checks stay lightweight (types compile, app boots). At the end there is **one joint test session** — Volkan, Fable, Codex — covering desktop, mobile, and reduced motion in the real browser. Evidence requirements from the old task apply *only* to that final session.

## LOOK DECISION (2026-07-17, FINAL — third confirmation by Volkan)

**The world is BRIGHT and COLORFUL. This is decided, not open.** The dark graphite/cyan void is retired — not as default, not as placeholder. Art direction reference: Volkan's FPV wonder video (floating islands, warm light, surreal gravity-bent landscapes, rich color). This decision was originally made in the octopus round and must never again be treated as pending.

- **All mechanics remain in force** — body, rig, intent API, response hierarchy, field coupling, journey stations, DOM layer. They are look-agnostic.
- Materials and color tokens stay swappable parameters (uniforms + OKLCH custom properties); the bright-world values from the look round replace the retired dark placeholders.
- The signal-grammar *mechanic* (a state color and a confirm color driven by engine state) stays; the exact colors come from the bright art direction.

## CHARACTER DECISION (2026-07-18, Volkan — FINAL)

**LENOX is the pearl-opal baby-cephalopod from Volkan's reference image (`docs/character/lenox-canonical-reference.png` — canonical, in-repo since 2026-07-19), kept as-is: huge green glass eyes, tiny nose, small mouth, webbed fin-ears, pearl-droplet crown, seafoam pearl skin, soft spiral arms.** Volkan's stated reason: the soul lives in the combination (eyes + tiny nose + small mouth + spirals + pearl skin); nose and mouth also enable richer emotion display later.

This supersedes, in GOAL item 1 below: the Black-Glass/Silver core as the face (retired with the robot-face veto of 2026-07-18) and the "no cartoon anatomy" clause where it conflicts with this reference. Still binding: LENOX is never baked into video; the response hierarchy, intent API and 2-lead/4-support runtime rig are unchanged — the authored character's visible arm styling follows the reference while mapping onto that rig; confirm-warmth appears only on genuine confirmation.

## GOAL

The complete LENOX final form runs live on the existing engine:

1. **Identity:** the existing Black-Glass/Silver core remains the face; it gains a gravitational cephalopod body — 2 lead arms (dense bones, targetable) + 4 support arms (authored poses + spring/secondary motion, no full IK). At distance an instrument, in motion a being. No suction cups, no cartoon anatomy, silhouette never starfish/spider/noodles.
2. **Behavior:** existing runtime states remain authoritative (`setLenoxState` / `setLenoxEmotion` / `setLenoxReaction`); one new discrete `setLenoxIntent` command (observe / guide / rest / confirm), eased inside the engine. Response hierarchy with staggered timing: perception surface ~80–120 ms → core ~180–260 ms → lead arm ~300–500 ms → support arms ~500–900 ms. Idle uses layered incommensurate frequencies (base ~0.13/0.07 Hz + micro ~0.72/1.05 Hz) — never a visible loop, never synchronized arms.
3. **One state drives three media:** the same engine parameters (energy / attention / tension) feed TSL material (Fresnel, cyan chroma, emissive pulse), field influence, and CSS custom properties (OKLCH `--signal` tokens). No duplicated state in React/CSS/GSAP.
4. **World:** collapse contract per `GRAVITY_BEATS` stays; after arrival the heavy solver retires to the quiet living field (~2,000–4,000 particles). Journey stations position LENOX per scroll act (authored stations, life within a station). Typographic deception: particles announce, mounted DOM type reveals in sync — no GPU glyphs.
5. **Content layer:** local decorative DOM reveals via native `animation-timeline: view()` under `@supports`, transform/opacity only; engine-coupled motion stays with `journeyDirector`. OKLCH tokens per Codex's starting values. No View Transitions until a second world exists.
6. **Eye-rig experiment (from ChatGPT's paper, instrumental not cartoon):** lid-occlusion / glint / convergence as a **toggleable layer over the existing display driver** — the current face is the control group; both variants must be comparable in the final session. Do not replace the display driver blind.
7. **Mobile is its own composition:** banded behavior, LENOX top-third, arms outside the text column, collapse compressed (~6.5 s), DPR ≤ ~1.5, no hover dependencies, vertical scroll never blocked.

## WHY

Every examined reference had half the answer (behavior without body, body without behavior, platform without being). The connection — one inner state moving body, world, and interface — is the demonstration that the website *is* the AI. This build is that connection.

## CURRENT REALITY

- Branch `codex/lenox-design-playground`, substantial uncommitted work — never reset or overwrite unrelated changes.
- Reusable foundation: single WebGPU loop in `src/flow-engine/`, `engineBridge`, `lenoxVessel.js`, `lenoxEyesDrive.js`, `gravityCreationTimeline.ts`, `journeyDirector.ts`, `stageState.ts`. Extend these; no second renderer, no R3F, no second state machine, no second scroll authority. Three.js stays 0.175.0.
- The interim body may be procedural placeholder geometry (Phase-1 silhouette style: provisional lead arms + simplified support arms on the existing core). The authored Blender GLB is a follow-up task once the silhouette proves itself in the joint session — do not block runtime work on asset production.
- A dev server is typically running at `localhost:3000`.

## VISIBLE DONE WHEN (checked once, at the joint session)

1. PLAY → WAKE → LENOX opens GRAVITY runs end to end with the body present: collapse per contract, arrival, one full scrolling act with LENOX stations, intent-driven arm behavior on pointer/scroll, dormant→observing→guiding→confirming readable.
2. Response hierarchy visibly cascades (eyes first, root last); arms read as one intelligence; silhouette holds at 64–96 px.
3. Desktop (60 fps target hardware) and mobile (390×844, stable frame rate, no horizontal overflow) as two composed versions; reduced motion reaches the identical semantic end state.
4. One state → three media demonstrable: a state change visibly alters material, field, and UI tokens from the same source.
5. Eye-rig toggle comparable against the control-group face.
6. `npx tsc --noEmit`, `node --test src/app/stage/*.test.ts`, `npm run build` pass; console clean on the golden path.
7. The confirm color appears only on genuine confirmation; the state color stays purposeful (exact colors per the look round — see LOOK REVISION); no smiling during serious creation beats.

## Boundaries

No commit, push, deploy, or dependency change without Volkan's explicit approval. No ATELIER/SIGNAL/switch runtime, no THE BLINK until a second world exists. Do not modify the protected WAKE materialization or the wallow/visual-gate reference material. Rejected for good: MP4/GOP-8 backgrounds, aquarium semantics, full-body cursor chasing, 360° spins, permanent bloom, per-frame React writes, five-tier quality matrices before profiling. One writer: while this task is open, only Codex writes to the tree.
