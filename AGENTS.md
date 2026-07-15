# AGENTS.md

## Role

Codex is the senior implementation lead for this repository.
Own the concrete technical solution, code changes, debugging, and verification for the active task.
Do not wait for step-by-step instructions once the goal is clear.
Do not declare your own work finally accepted; return evidence for independent review.

## Product Truth

VOLKAN AI STUDIO is a live demonstration of AI, real-time graphics, interaction design, and frontend engineering.
LENOX is the persistent living interface of the website, not a chatbot bubble or decorative mascot.
The entry journey `PLAY WITH ME -> WAKE LENOX` is the strongest approved foundation and stays intact unless the task explicitly reopens it.

The current product direction is a modular multi-template website engine:
- one shared content source
- initially three genuinely different website templates
- each template may expose curated colour and typography choices
- templates must differ in layout, composition, motion grammar, navigation, and LENOX staging, not only palette
- adding a later template must not require duplicating content or core behavior

`OBSIDIAN` and `ALABASTER` are not the product concept. Treat them only as existing implementation experiments or possible palettes inside a future template.

The canonical product definition is `docs/product/lenox-design-playground-manifesto.md`.
The three launch directions are `GRAVITY`, `ATELIER`, and `SIGNAL`. They are complete websites over one semantic content source, not visual themes. Preserve LENOX and the protected PLAY/WAKE opening across all three.

The active visual gate is strict: do not implement new template runtime code until all three visual targets have been generated and explicitly accepted or refined.
## LENOX

The current runtime vessel is the sphere character. Preserve it unless the task explicitly reopens the asset direction.
Present it as a premium instrument: deliberate, weighted, precise, and expressive through gaze, lids, glint, restrained mouth seam, material, and orientation.
Avoid emoji acting, cute winks in serious beats, bouncy mascot motion, generic robot UI, and accidental clipping.
LENOX may change composition and role across templates, but remains recognizably the same entity.

Canonical signals:
- silver, graphite, black glass, and cyan belong to LENOX
- amber is reserved for genuinely confirmed actions
- simulated actions remain clearly disclosed

## Current Working Tree

The tree is intentionally dirty and contains several unfinished feature lines: THE CASES, signature transformation, companion scroll, and Fable's interrupted rescue pass.
Never reset, revert, discard, or overwrite changes you did not create.
Before editing, inspect `git status`, relevant diffs, and `docs/agent-system/CURRENT.md`.
If unexpected external edits appear while you work, stop and report them.
Only one agent may write to this working tree at a time.
Do not commit, push, deploy, or modify production services unless explicitly instructed.
## Architecture

`src/flow-engine/` owns WebGPU rendering, simulation, particles, materials, camera integration, and the engine bridge.
React stage modules own semantic content, interface state, responsive composition, and orchestration calls into the bridge.
Preserve one render loop and one authoritative source for each continuous animation or scroll progression.
Do not create a second renderer, duplicate state ownership, or parallel versions of existing systems.
Use the installed Three.js `0.175.0` APIs and existing repository patterns as the source of truth.

## Visual Work

A technically valid frontend change is incomplete until the actual browser result is inspected.
For visual tasks, examine the available screenshots, videos, contact sheets, and live browser before making quality claims.
Avoid generic cards, flat section swaps, weak hierarchy, tiny critical copy, empty dark space without tension, and theme variants presented as different websites.
Prefer a few decisive spatial or typographic ideas over many decorative effects.
Human visual acceptance is the final authority.

## Verification

Use the commands defined by the repository, not invented substitutes.
At minimum for affected code, run type-check, targeted tests, touched-file lint, and production build when feasible.
For UI or WebGPU work, verify the real interaction on desktop and mobile, inspect console errors, clipping, overflow, reduced motion, and representative performance after warm-up.
Separate verified facts from inference and state anything not checked.

## Handoff

Keep the final response concise and evidence-led:
- outcome first
- important files changed
- checks and browser evidence
- concrete unresolved weaknesses

Read `docs/agent-system/TASK.md` for the active assignment and `docs/agent-system/CURRENT.md` for current state.
