# ACTIVE TASK: LENOX Core Presence + Reef Reskin

**Assigned:** 2026-07-19, by Volkan. Codex `gpt-5.6-sol` is sole runtime writer. Fable wrote this briefing.
**Mode:** MOMENTUM. No intermediate gates, no per-step video proofs, no verification pauses. Code the full scope in one run; author self-checks stay light (types compile, build boots). One joint test session at the end.

The design-system pass is closed (N-design registry, axes carried into CSS, gate leak fixed, timers clean, 30/30 tests, build green). It is **architecture-complete and not visually accepted** — no polish there until the final debugging session.

## WHY THIS, NOW

The three-layer composition cannot be judged with the middle layer missing. The scrubbed film is verifiable on its own, but whether the dark content islands hold over the loud world, where LENOX sits in frame, and whether the three layers read as one image — none of that is answerable today. This pass puts the being into the frame so the final session has something to judge.

## SCOPE — everything codable in one run

1. **Reskin to the bright world.** Pearl-opal materials replace the retired graphite/cyan values on body and eye rig. Uniforms and OKLCH tokens stay swappable parameters — the LOOK DECISION below is binding and not reopened.
2. **The face.** Build against `docs/character/lenox-canonical-reference.png` — the canonical LENOX, in-repo. It carries **both** a tiny nose and a small closed-lip mouth (a faint upward curve, not a grin), plus the traits that make the soul: huge green glass eyes with a bright specular highlight, webbed fin-ears, pearl-droplet crown over the dome, seafoam pearl skin with iridescent speckling, and eight soft spiral arms with pale suckers. Decided 2026-07-18, never built — `lenoxBody.js` currently has arms only.

   **Expression channels (from the 2026-07-19 motion study).** A generated emotion clip was reviewed frame by frame. It is **not** a character reference — that character drifted (spiked crest, drawn-out snout, open cartoon mouth) and the PNG remains the shape law. What it did prove is the channel hierarchy, which is worth building to:

   - **Brow leads.** Inner brow ends tilting up carried the entire read of concern; the mouth only confirmed it.
   - **The fin-ears are an emotion channel.** They lift and spread on positive states, drop and fold on negative ones. Cheap to rig, and it survives at 64–96 px where mouth movement does not.
   - **The eye highlight stays fixed** while the lid shape changes. That is what keeps the gaze alive rather than rendered.
   - **The mouth stays closed-lip.** Joy is a change in curvature, never an open grin — otherwise "no smiling during serious creation beats" becomes unbuildable.

   Not adopted from the clip: shifting anatomy, eyelashes, tears, heavy eyebrows, belly plating, cartoon mouth shapes. Sadness in particular is not a system state — `LenoxEmotion` communicates what LENOX is doing, not how it feels; the negative register is `concerned`.

   **The runtime rig does not change.** The reference has eight arms; the rig stays 2 lead + 4 support. The authored character's visible arm styling follows the reference and maps onto that rig. The reference is the target for material, proportion and face; it is not a modelling spec to reproduce literally.
3. **Presence across the studio journey.** LENOX already survives the design morph (the bridge effect is keyed to `[reduced, writeSignals]`, and the layer sits outside `StudioJourney`) — **verify this, do not rebuild it.** What is missing: consuming the registry's `lenoxPresence` axis in the engine, and per-chapter placement through the existing station poses.
4. **Vocabulary cleanup, narrow.** Drop the four legacy aliases from `LenoxProofState` (`idle`/`attract`/`waking`/`alive`) once the proof harness no longer needs them, and derive the studio's `LenoxStatus` from the engine vocabulary instead of paralleling it. No new type replaces them.
5. **Reduced motion and banded composition.** Mobile is its own composition, per GOAL item 7 below.

## OUT OF SCOPE — do not build

- **No fourth state machine.** `LenoxProofState` / `LenoxEmotion` / `LenoxIntent` are layered by design and stay authoritative. "Second state machine" is Rejected For Good.
- **No per-emotion parameter tables.** Wire the transitions and hooks; leave the values coarse. Eye openness, iris position, blink rate, head tilt and mouth state get tuned in the final session with the image present — tuning them blind is the parameter circle that has cost this project twice.
- ~~No authored Blender GLB~~ — **superseded 2026-07-19 by Volkan.** The Blender path is now in scope and running in parallel: a reproducible generator (`tools/blender/generate_lenox_blockout.py`) drives the blockout, artifacts land in `artifacts/lenox-blender/`. Silhouette iterations are judged from renders, not from description. Renders must be shot **on a bright background** — a pearl character on near-black misrepresents how it reads over the reef film, and the bright world is decided.
- No visual acceptance, no browser gates, no screenshots requested along the way.
- No Journey rebuild, no design-system polish, no old-stage cleanup.

## DONE WHEN (checked once, at the joint session)

Desktop, mobile 390×844, reduced motion, both designs, and a morph with LENOX present throughout. `npx tsc --noEmit`, `npm test`, `npm run build` green; console clean on the golden path.

Boundaries below still bind — especially: no commit, push, deploy or dependency change without Volkan's approval, and one writer at a time.

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
