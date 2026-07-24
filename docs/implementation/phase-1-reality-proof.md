# Phase 1 Reality Proof — Remediation Brief

## Status

`REMEDIATION ACTIVE · NO-GO`

The implementation must prove four things inside the existing Studio architecture:

1. SIGNAL, GRAVITY and ATELIER read as independent websites.
2. Shared semantic state survives every switch.
3. The Cut renders source and target concurrently; it is not a cover/swap wipe.
4. Mobile is deliberately composed, not scaled desktop.

## Required corrections

- SIGNAL is the only public design during the proof phase. GRAVITY and ATELIER are development-proof only.
- The initial SIGNAL graph contains no Three.js, WebGPU, MPM, LENOX or film runtime.
- GRAVITY uses a dynamically loaded field-only runtime. It must not import or load the character, vessel, backdrop, film or historical HDRI.
- A GRAVITY switch waits for the first rendered field frame, with a 1500 ms static-fallback deadline.
- The field runtime has an idempotent cold/initializing/running/suspended/failed/disposed lifecycle and one RAF.
- The homepage does not persist `introPhase`; historical PLAY/WAKE state is not deleted or rewritten.
- The Cut keeps source and target mounted together, preserves shared anchors and commits URL/state only after the final transition.
- Proof content is bilingual and semantic. The analysis fixture is not client work.
- ATELIER is led by the historical internal design-study artifact and truthful annotations.
- The LENOX chooser is an accessible non-modal region.

## Boundaries

No `/lab`, live AI, crawler, simulator, scheduling, outreach, final GRAVITY palette, new dependency, WebGL path, second app root or second state architecture. Preserve the historical implementation and assets. Do not push or deploy.

## Acceptance

Technical acceptance requires tests, TypeScript, touched-file ESLint, production build, the two-stage homepage bundle guard and `git diff --check`. These checks do not prove visual quality.

Volkan alone reviews `/?proof=realities` on desktop, 390×844, reduced motion and WebGPU-off. Agents do not run browser automation, screenshots or visual acceptance.
