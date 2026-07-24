# Active Task — Phase 1 Reality Proof Remediation

Binding implementation brief: `docs/implementation/phase-1-reality-proof.md`.
This file retains the original scope and history; the remediation brief wins
where the previous completion claims or mechanics conflict.

## Objective

Prove, inside the existing `src/app/studio` architecture, that one factual
content/state kernel can render as three genuinely different realities and
switch through one signature Cut without losing interaction state.

## Product decisions

- Public default: `SIGNAL`.
- Canonical IDs: `signal`, `gravity`, `atelier`; legacy `reef` maps to
  `gravity` and `?reality=` is read-only compatibility.
- `/` mounts no EntryGate. Preserve PLAY/WAKE code for later `/lab`.
- SIGNAL and ATELIER are DOM-first. GRAVITY uses the existing WebGPU field with
  no film and no persistent v006 character.
- v006 remains preserved for `/lab` and a later Volkan-approved reveal.
- Volkan alone performs visual checks. Do not use Playwright, browser
  automation, screenshots or agent visual acceptance.

## Exact scope

1. Extend the existing design registry, reducer, provider and morph transaction;
   do not create parallel infrastructure.
2. In development, `?proof=realities` renders a compact shared proof model as
   independent SIGNAL, GRAVITY and ATELIER components.
3. The proof includes the locked claims, one neutral proof artifact, one text
   input and one openable typed analysis fixture. Label it
   `PROOF FIXTURE · NOT FOR PUBLIC RELEASE`, never `CLIENT WORK`.
4. Preserve proof input and analysis result through every switch.
5. Upgrade the existing curtain into a two-phase material Cut. Last requested
   design wins during rapid switching. Reduced motion reaches the same state.
6. Add keyboard `1`, `2`, `3` and `L`; LENOX maps TRUST to SIGNAL, INNOVATION to
   GRAVITY and CHARACTER to ATELIER with one short reason.
7. Provide explicit desktop/mobile/fallback/reduced states and a concise manual
   checklist for Volkan.

## Boundaries

- No full three-site build, final GRAVITY palette, real cases or case migration.
- No `/lab` route, AI backend, crawler, simulator, booking, outreach or
  Operating Index.
- No dependency, package-manager, WebGL, renderer, app-root or state-library
  addition.
- Do not delete film assets, scrubber code, PLAY/WAKE or v006 assets.
- No push or deployment.

## Technical gates

- `npm run build`
- `npm test`
- `npx tsc --noEmit`
- touched-file ESLint
- `git diff --check`
- Unit coverage for canonical IDs, legacy migration, gate normalization, proof
  state preservation and last-request-wins transaction behavior.

The task stops after technical evidence and the manual review checklist. Volkan
decides the visual Go/No-Go.

## Implementation status (2026-07-24, post-audit)

- [x] SIGNAL default and v1 session migration.
- [x] Canonical SIGNAL, GRAVITY and ATELIER registry with engine modes.
- [x] Development proof at `?proof=realities` inside `StudioExperience`.
- [x] Shared input and disclosed analysis fixture survive all three switches.
- [x] Concurrent source/target Cut with last-request-wins commit semantics.
- [x] Keyboard `1`, `2`, `3`, `L` and transparent LENOX selection logic.
- [x] GRAVITY uses an isolated field-only runtime without character, vessel, HDRI or film imports.
- [x] Static GRAVITY composition remains when WebGPU is unavailable or misses the first-frame deadline.
- [x] Contract, entry persistence, locale, accessibility and active bundle graph remediated.
- [x] Tests, TypeScript, touched-file ESLint, diff check, production build and bundle guard.
- [ ] Volkan desktop, 390x844, hammering, reduced-motion and WebGPU-off review.
- [ ] Volkan Go/No-Go.

Technical remediation is complete. Phase 1 remains open until Volkan completes
the two unchecked visual gates. No browser automation or agent visual acceptance
was performed.
