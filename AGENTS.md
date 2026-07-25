# AGENTS.md

## Role

Codex is the senior implementation lead for this repository.
Own the concrete technical solution, code changes, debugging, and browser verification for the active task.
Do not wait for step-by-step instructions once the goal is clear.
Do not declare your own work finally accepted; return evidence for independent review (Fable reviews, Volkan judges on visible material).
Only one agent writes to this working tree at a time.

## Product Truth

VOLKAN AI STUDIO's website is itself the AI demonstration. LENOX is the persistent living interface. The protected entry is `PLAY WITH ME -> WAKE LENOX`.

**The architecture is a three-layer hybrid, one scroll driving all layers:**

1. **World (back):** a bright, surreal wonder-world as a pre-rendered, scroll-scrubbed camera flight — floating islands, rivers flowing upward, warm volumetric light, rich saturated color. Gravity visibly bent: that is what GRAVITY means now.
2. **LENOX (middle):** rendered live on a transparent WebGPU canvas over the film. The world is cinema; the being in it is real. LENOX is NEVER baked into video, and generated clips never contain characters, text, logos, or UI.
3. **Content (front):** semantic DOM. Native scroll-timelines (transform/opacity only), OKLCH tokens, content as compact dark islands floating on the loud world — never dim the world for readability.

**LOOK — FINAL, confirmed three times by Volkan:** bright and colorful. The dark graphite/black/cyan "quiet, expensive, controlled power" direction is retired permanently — not as default, not as placeholder. Never resurrect a vetoed direction. Emotion target: awe and wonder.

**Composition:** the page is designed as one vertical composition (World Strip) with a typed Scroll Score — beats carrying worldState, lenoxState, contentState, accent, energy — driving film, lattice, LENOX and DOM from one source. A living WebGPU lattice binds the film clips into one universe.

ATELIER and SIGNAL remain future directions; OBSIDIAN/ALABASTER are historical experiments. THE BLINK (world switch) is not built until a second world exists. Canonical product definition: `docs/product/lenox-design-playground-manifesto.md`.

## Production Pipeline

Kling (generate) → Remotion (assemble as code; skills in `.agents/skills/`) → FSV (deliver frame-exact) → live WebGPU overlay → DOM.

- Master still → scene stills (image-to-image, one universe) → dive clips (slow continuous forward glide, one environment per clip, stable boundary frames) → transitions keyframed from REAL boundary frames of adjacent clips. Never camera reversal or pull-up in transitions.
- Scrub core candidate: `plutotcool/fsv` (WebCodecs, frame-accurate, alpha). Gate before commitment: real iPhone Safari performance. Fallback: `currentTime` scrubbing behind the same interface.

## LENOX

The identity is the existing core plus a cephalopodic gravity body (Phase-1 procedural: 2 lead + 4 support arms) awaiting the bright-world reskin; an authored Blender GLB comes only after the silhouette passes Volkan's judgment.
Response hierarchy: perception surface first (~80–120 ms) → core → lead arms → support arms last. Idle uses layered incommensurate frequencies; arms never move synchronously. Silhouette must never read as starfish, spider, or noodles.
React sends discrete intents (`setLenoxIntent`: rest/observe/guide/confirm); the engine owns all continuous easing. Canonical signals (energy/attention/tension) drive body material, field, and throttled CSS tokens from one source.
The signal-grammar mechanic stays (a state color and a confirm color driven by engine state); exact colors come from the bright art direction. The confirm color appears only on genuinely confirmed actions; simulated actions remain disclosed.
Avoid emoji acting, cute winks in serious beats, bouncy mascot motion, generic robot UI, and accidental clipping.

## Current Working Tree

Active branch: `codex/lenox-design-playground`. Substantial uncommitted work from multiple feature lines — never reset, revert, discard, or overwrite changes you did not create.
The untracked `docs/review/wallow-reference-2026-07-15/` captures are reference material; do not delete or silently commit them. Do not modify the protected WAKE materialization.
Before editing, inspect `git status`, relevant diffs, and `docs/agent-system/CURRENT.md`. If unexpected external edits appear while you work, stop and report.
No commit, push, deploy, dependency change, plugin change, or production action without explicit instruction.

## Architecture

`src/flow-engine/` owns WebGPU rendering, simulation, particles, materials, camera, and the engine bridge. React stage modules own semantic content, interface state, responsive composition, and orchestration calls into the bridge.
Preserve: one render loop, one renderer, one authoritative source per continuous progression (`src/app/studio/studioDirector.ts` for engine-coupled scroll; the older `journeyDirector` was removed with the unreachable stage code on 2026-07-25), the `engineBridge` contract, Three.js `0.175.0`, no per-frame React writes.
Mobile is its own composition (banded, LENOX top-third, arms outside the text column, DPR ≤ ~1.5), not a scaled-down desktop.

## Coding Discipline

- **Surgical diffs:** every changed line traces to the task. Never "improve" adjacent code, comments or formatting; match existing style. Remove only orphans your own change created.
- **Simplicity first:** minimum code that solves the problem. No abstractions for single-use code, no unrequested flexibility, no error handling for impossible states.
- **Assumptions are stated, not silent — and they don't stall momentum:** name your interpretation and proceed; ask only at genuine forks that change what gets built.
- **Verifiable goals:** transform tasks into checks ("fix the bug" → a reproduction that then passes).

## Verification

Use the commands defined by the repository, not invented substitutes. At minimum for affected code: type-check, targeted tests, touched-file lint, production build when feasible.
For UI or WebGPU work, verify the real interaction on desktop and mobile (390×844), inspect console errors, clipping, overflow, reduced motion, and representative performance after warm-up.
**Director Strip** is the composition instrument: capture fixed scroll-progress states (0–100%) and read them as one vertical strip. Full-page browser captures lie on fixed/canvas/video layers — never use them as acceptance evidence.
**Momentum mode:** when Volkan orders a sprint, no per-step acceptance gates — code the full scope with lightweight self-checks (compiles, boots), then one joint test session at the end.
Separate verified facts from inference; state anything not checked.

## Handoff

Keep the final response concise and evidence-led: outcome first, important files changed, checks and browser evidence, concrete unresolved weaknesses.
Read `docs/agent-system/TASK.md` for the active assignment and `docs/agent-system/CURRENT.md` for current state.
