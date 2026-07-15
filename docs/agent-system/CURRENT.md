# Current Handoff

**Date:** 2026-07-15
**Writer state:** No writer is active. The Design Playground is waiting at the human visual gate.
**Repository:** rescue checkpoint `5c84922` and visual-direction checkpoint `473cdb6` exist on `codex/lenox-design-playground`; no destructive cleanup is allowed.

## Product Direction

The approved direction has changed since the interrupted run.
The goal is not an `OBSIDIAN -> ALABASTER` website.
The goal is a modular engine with three genuinely different website templates sharing one content source, with curated colour and typography controls inside each template.
LENOX persists across all templates and remains the live interface.
The existing `PLAY WITH ME -> WAKE LENOX` entry remains the strongest protected foundation.

The canonical product truth now lives in `docs/product/lenox-design-playground-manifesto.md`.

The launch directions are:
- `GRAVITY`: cinematic spatial website
- `ATELIER`: asymmetric editorial website
- `SIGNAL`: precise systemic website

They share semantic content and LENOX, but must differ in layout, navigation, typography, motion grammar, spatial composition, and content staging.

## Active Gate

No new template runtime code may be written until three independent visual targets have been generated and accepted or refined.

Three desktop candidates now exist under `docs/review/lenox-design-playground-visual-gate/`:
- `gravity-desktop.png`
- `atelier-desktop.png`
- `signal-desktop.png`

They establish distinct composition, navigation, typography, and LENOX roles. They have not received human visual acceptance and do not complete Milestone 1. Mobile keyframes, real-asset PROOF states, reconstruction frames, and the shared six-phase reconstruction storyboard remain open.

The current run may:
- document the product truth
- capture and inspect the current visual baseline
- generate three visual targets and a reconstruction storyboard
- document the visual verdict

The current run may not:
- build a template registry
- extract shared content into production code
- implement GRAVITY, ATELIER, or SIGNAL components
- migrate signature engine APIs
- push or deploy

## Visual Gate Checkpoint Verification

Run at visual-direction checkpoint `473cdb6`:
- `node --test src/app/stage/*.test.ts` -> 16 passed, 0 failed; Node emitted the existing module-type warnings
- `npx tsc --noEmit` -> passed
- `npm run build` -> passed; 5/5 pages generated
- `npm run lint` -> failed on one pre-existing `prefer-const` error in `src/lenox-engine/particleSystem.ts:249`; 56 warnings remain, mostly in bundled skill examples
- `git status --short --branch` -> clean on `codex/lenox-design-playground`

The visual-gate commit changes documentation and image references only. Runtime code at `473cdb6` is identical to the verified rescue runtime at `5c84922`.

## Current Code Lines

The tree mixes several uncommitted candidates:
- THE CASES and Contact Uplink
- signature/world transformation
- companion scroll Journey
- Fable's interrupted art-direction rescue

Do not assume all changes belong to one accepted feature.
Do not revert them merely because the product direction changed; first identify reusable infrastructure versus direction-specific presentation.
## Fable's Last Changes at Interruption

Fable was in the middle of a rescue pass and changed the following concepts:
- replaced separate transform beats with one linear `0..1` transform progress scalar
- derived gather, ignition, scan radius, environment blend, and particle response from that scalar
- made the reconstruction front irregular, wider, pre-lit, and capable of tilting backdrop normals
- added particle flare at the scan front
- reduced Journey camera lag and refreshed ScrollTrigger after fonts load
- exposed per-section scroll progress through `--sp`
- replaced EXPERIENCE cards with depth-staged plates
- replaced the SYSTEMS numbered list with material strata
- added a dev-only `window.__LENOX_SHOT__` control surface

Fable stopped before lint, production build, browser verification, keyframes, video, and final report.
The last visible task state was two tasks in progress and one open. The technical verification gap is superseded by the Codex checkpoint below; visual desirability is still subject to independent review.

## Verified After Interruption

Run from the repository after Fable stopped:
- `npx tsc --noEmit` -> passed
- `node --test src/app/stage/*.test.ts` -> 16 passed, 0 failed

## Codex Takeover Checkpoint

Run locally on 2026-07-15 without committing, pushing, deploying, adding dependencies, or discarding pre-existing work.

Concrete repairs:
- corrected the Fraunces variable-font configuration so the production build can compile
- replaced the deprecated Three.js TSL `atan2` alias with the installed r175 `atan` overload
- made optional build-timeline selectors conditional, eliminating GSAP warnings when a template omits legacy targets
- made the Journey scroller the authoritative build scope so its navigation rail participates in the same timeline
- separated the mobile interaction scroller from the fixed LENOX system band and ensured anchored station headings clear the sticky rail

Verification from this run:
- `npx tsc --noEmit` -> passed
- `node --test src/app/stage/*.test.ts` -> 16 passed, 0 failed
- touched-file ESLint -> 0 errors; 2 warnings in `src/app/api/send-overview/route.ts`, both confirmed pre-existing in `HEAD`
- changed JavaScript syntax checks -> passed
- `npm run build` -> passed; 5/5 static pages generated
- `git diff --check` -> passed
- desktop live flow -> `PLAY WITH ME -> WAKE LENOX -> First Contact -> LENOX -> READY` reached with no browser warnings or errors
- desktop Journey navigation, case replay, case close, and the non-delivery Contact Uplink path were exercised
- mobile `390x844` flow -> no horizontal overflow; question and Journey content remain below the LENOX band; vertical and anchored navigation worked; no browser warnings or errors
- reduced-motion browser flow -> reached READY with no browser warnings or errors

The checkpoint is technically runnable and safe to continue from. It is not a claim that the interrupted visual direction is approved or production-polished. Representative performance profiling and independent human visual acceptance remain open.

## Multi-template Reuse Boundary

Reusable foundation:
- the protected PLAY/WAKE/First Contact state flow and reducer contracts
- `compositionMode` and its banded/embedded responsive composition boundary
- one Journey scroller, station registry, director, ScrollTrigger timeline, and engine pose bridge
- the engine bridge and the single WebGPU render loop
- the warning-free optional-target build timeline pattern
- deterministic case timing plus the explicitly simulated/non-delivery uplink behavior
- the current i18n/content messages as source material for a future shared content model

Legacy or direction-specific:
- `OBSIDIAN`/`ALABASTER` signature IDs, calibration choice, transformation presets, and signature-specific engine materials
- Fraunces/ivory/obsidian visual tokens and the current reconstructed DOM world
- the current EXPERIENCE plates, SYSTEMS strata, WORK case staging, Contact composition, copy hierarchy, and station-specific camera poses
- the present LENOX facial acting and some dense/stacked mobile compositions, which still need an approved template-specific art direction
- the `VOLKAN` branch remains advertised as pending rather than implemented

After the full visual gate receives human acceptance, the first runtime slice should extract the reusable contracts into a template registry plus one shared content source before creating any new visual template. It must not treat the current two signatures as two of the required three websites.
## Important Files

- `AGENTS.md` - Codex project instructions
- `CLAUDE.md` - Fable orchestration instructions
- `.codex/config.toml` - project-local Codex profile
- `docs/agent-system/TASK.md` - active Codex assignment
- `docs/concepts/der-begleiter-storyboard.md` - historical concept; parts are now superseded
- `docs/review/` - visual review material already in the repository

Legacy long instruction files were preserved under `docs/agent-system/` before replacement.
