# AGENTS.md

## Role

Codex is the senior implementation lead for this repository.
Own the concrete technical solution, code changes, debugging, and technical verification for the active task.
Do not wait for step-by-step instructions once the goal is clear.
Do not declare visual work finally accepted; Volkan alone judges visible material.
Only one agent writes to this working tree at a time.

## Product Truth

`/PRODUCT_CONTRACT.md` is the canonical product truth. VOLKAN AI STUDIO is a
living agency demonstration: one factual content system rendered as three
complete realities.

- `SIGNAL` is the public default and commercial trust layer.
- `GRAVITY` is the spatial, mass-driven, computational signature. GRAVITY REEF,
  fantasy landscapes and film as the core architecture are retired.
- `ATELIER` is artifact-led editorial and proves cultural/creative direction.
- The homepage has no mandatory gate. The existing black PLAY/WAKE experience
  is preserved for a later `/lab`, not mounted on `/`.
- LENOX is the operating intelligence. The v006 character is not persistent on
  the public homepage; it may return only in `/lab` or a Volkan-approved reveal.
- `AI-OPERATED. HUMAN-DIRECTED.` is the public operating claim. Simulation and
  real action must always be distinguishable.

Phase 1 is only the development Reality Proof Slice described in
`docs/agent-system/TASK.md`. It does not authorize full reality builds, live AI,
outreach, deployment or new dependencies.

## Current Working Tree

Active branch: `codex/living-agency-v1`. The pre-pivot Studio/Engine/v006 state is preserved in baseline commit `8b8046e`; never reset, revert, discard, or overwrite it.
The untracked `docs/review/wallow-reference-2026-07-15/` captures are reference material; do not delete or silently commit them. Do not modify the protected WAKE materialization.
Before editing, inspect `git status`, relevant diffs, and `docs/agent-system/CURRENT.md`. If unexpected external edits appear while you work, stop and report.
No commit, push, deploy, dependency change, plugin change, or production action without explicit instruction.

## Architecture

`src/flow-engine/` owns WebGPU rendering, simulation, particles, materials, camera, and the engine bridge. React stage modules own semantic content, interface state, responsive composition, and orchestration calls into the bridge.
Preserve: one render loop, one renderer, one authoritative source per continuous progression (`journeyDirector` for engine-coupled scroll), the `engineBridge` contract, Three.js `0.175.0`, no per-frame React writes.
Mobile is its own composition (banded, LENOX top-third, arms outside the text column, DPR ≤ ~1.5), not a scaled-down desktop.

## Coding Discipline

- **Surgical diffs:** every changed line traces to the task. Never "improve" adjacent code, comments or formatting; match existing style. Remove only orphans your own change created.
- **Simplicity first:** minimum code that solves the problem. No abstractions for single-use code, no unrequested flexibility, no error handling for impossible states.
- **Assumptions are stated, not silent — and they don't stall momentum:** name your interpretation and proceed; ask only at genuine forks that change what gets built.
- **Verifiable goals:** transform tasks into checks ("fix the bug" → a reproduction that then passes).

## Verification

Use the commands defined by the repository, not invented substitutes. At minimum for affected code: type-check, targeted tests, touched-file lint, production build when feasible.
For Phase 1 UI or WebGPU work, provide deterministic review states and a concise manual checklist. Do not run Playwright, browser automation, screenshots or visual acceptance; Volkan performs desktop, mobile (390×844), reduced-motion and fallback judgment himself.
**Momentum mode:** when Volkan orders a sprint, no per-step acceptance gates — code the full scope with lightweight self-checks (compiles, boots), then one joint test session at the end.
Separate verified facts from inference; state anything not checked.

## Handoff

Keep the final response concise and evidence-led: outcome first, important files changed, technical checks, Volkans manual review checklist and concrete unresolved weaknesses.
Read `docs/agent-system/TASK.md` for the active assignment and `docs/agent-system/CURRENT.md` for current state.
