# AGENTS.md

## Role

Codex is the senior implementation lead for this repository.
Own the concrete technical solution, code changes, debugging, and browser verification for the active task.
Do not wait for step-by-step instructions once the goal is clear.
Do not declare your own work finally accepted; return evidence for independent review (Fable reviews, Volkan judges on visible material).
Only one agent writes to this working tree at a time.

## Product Truth

VOLKAN AI STUDIO's website is itself the AI demonstration. It sells two connected things: signature digital experiences, and custom AI intake/workflow systems.

**LENOX is the behaviour of the website, not a character on it.** No mascot, no face, no body, no arms, no authored character asset. Recognisable by what the page does, never by anatomy.

**Two layers, one scroll:**

1. **Matter (back):** the live WebGPU engine. One particle population, one material.
2. **Content (front):** semantic DOM — copy, navigation, language, accessibility. Always above the renderer, never reaching into it.

**Words are fixed, design is not.** One bilingual content kernel serves every design, word-identical: `docs/product/studio-content-contract.md` is binding. Designs are different disciplines, not different colours.

> **Art direction is deliberately not in this file** — it changes on visible material and would rot here. Current direction: `docs/product/design-01-living-surface.md`. Current tree and decisions: `docs/agent-system/CURRENT.md`.

## Media Pipeline (conditional)

Not used by design 01, which is fully computed. If a later chapter needs imagery:

Kling (generate) → Remotion (assemble as code; skills in `.agents/skills/`) → frame-exact delivery → DOM.

- Master still → scene stills (image-to-image, one universe) → clips (slow continuous glide, stable boundary frames) → transitions keyframed from REAL boundary frames. Never camera reversal in transitions. Clips contain world only — no characters, text or logos.
- Encode one keyframe per frame (`-g 1`) or the scrub stutters. Gate: real iPhone Safari.
- Portrait is produced, never cropped.

## LENOX

One solver, one particle population, one material language, multiple force and target states. LENOX is a **directed condensate state** inside that population: local density rises, motion becomes directed, matter connects optically. It never becomes a face, a mascot or a generic blob.

React sends discrete intents; the engine owns all continuous easing. Canonical signals (energy/attention/tension) drive material, field, and throttled CSS tokens from one source.

The procedural body (`lenoxBody.js`, 2 lead + 4 support arms) and the authored character path are **retired as of 2026-07-25**; still present in the engine, to be removed once the phase-field proof replaces them. Do not extend them.

## Current Working Tree

One branch: `main`, in sync with `origin/main`. `origin/codex/living-agency-v1` is archived — it holds the rejected field-only runtime and the only v006 Blender pipeline; do not merge it back.

Never reset, revert, discard or overwrite changes you did not create. Before editing, inspect `git status`, relevant diffs, and `docs/agent-system/CURRENT.md`. If unexpected external edits appear while you work, stop and report.
No commit, push, deploy, dependency change, plugin change, or production action without explicit instruction.

## Architecture

`src/flow-engine/` owns WebGPU rendering, simulation, particles, materials, camera, and the engine bridge. React stage modules own semantic content, interface state, responsive composition, and orchestration calls into the bridge.
Preserve: one render loop, one renderer, one authoritative source per continuous progression (`src/app/studio/studioDirector.ts` for engine-coupled scroll; the older `journeyDirector` was removed with the unreachable stage code on 2026-07-25), the `engineBridge` contract, Three.js `0.175.0`, no per-frame React writes.
Mobile is its own composition (banded, its own portrait assets, DPR ≤ ~1.5), not a scaled-down desktop.

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
