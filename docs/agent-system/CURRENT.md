# Current Handoff

## REALITY PROOF TECHNICALLY REMEDIATED — VISUAL GO PENDING (2026-07-24, Codex)

Volkan approved `/PRODUCT_CONTRACT.md` v1.2 for implementation. SIGNAL is now
the public default; the homepage has no mandatory gate; the three canonical
realities are SIGNAL, GRAVITY and ATELIER. GRAVITY REEF, mandatory film-world
architecture and persistent v006 character staging are historical directions.
The existing PLAY/WAKE implementation and v006 production candidate remain
preserved for a later `/lab` and optional Volkan-approved signature reveal.

Active branch: `codex/living-agency-v1`. Baseline commit `8b8046e` preserves the
complete pre-pivot Studio/Engine/v006 work before the contract migration. The
current assignment is the isolated development Reality Proof Slice in
`docs/agent-system/TASK.md`. Volkan owns all visual checks; agents run no browser
automation or screenshot acceptance for this phase.

The first proof implementation at `4788bf4` remains unaccepted. Independent
audit confirmed four blockers: the root contract was shortened, homepage
hydration destroyed the historical intro-state contract, GRAVITY's declared
field mode started the full character runtime, and the visual transition
remained a cover/swap curtain. Commits `0af3224`, `3d645b7` and `8d61570`
remediate those technical failures without rewriting the protected legacy
runtime.

The exact v1.1 source is archived under `docs/product-contract/`; the active
technical brief is `docs/implementation/phase-1-reality-proof.md`. The proof now
has a field-only dynamic runtime, first-rendered-frame gate, route-effective
entry state, concurrent source/target Cut, bilingual content, artifact-led
ATELIER and a two-stage bundle guard. `npm test`, TypeScript, touched-file
ESLint, the production build, `git diff --check` and the bundle guard pass. The
guard reports 15 statically reachable homepage modules and 8 initial SIGNAL JS
chunks totalling 604075 bytes, with none of the forbidden legacy asset
references. These facts do not prove visual quality. The manual gate is
`docs/review/reality-proof-manual-checklist.md`; Volkan remains the sole visual
judge and agents ran no browser or screenshot acceptance.

Everything below this block predates v1.2 and is retained as implementation
history. Where it conflicts with `/PRODUCT_CONTRACT.md`, the root contract wins.

## ONE-MAIN CONSOLIDATION (2026-07-20, Codex)

The repository is consolidated on local `main`. All local side branches and the
magnetic worktree were removed after the curated commits and verification gates
passed. `origin/main` remains intentionally unchanged and is six commits behind
the local branch pending separate push approval.
The runtime still loads `lenox-v004.glb`. The complete v005 authored package was
recovered byte-for-byte from local Git objects and passes its independent GLB
audit, but remains a non-promoted visual candidate pending human review.

Required runtime media, canonical Blender sources and compact inspection packs
are versioned directly in Git. Browser logs, duplicate encodes, Blender backups,
third-party example models and reproducible frame dumps are local-only per
`docs/architecture/repository-asset-policy.md`.

## N-DESIGN REGISTRY ACTIVE (2026-07-19, Codex)

The Studio build is no longer a hardcoded `reef | signal` switch. `src/app/studio/designRegistry.ts` is the active product registry and derives `DesignId`, valid IDs, labels, world-media behavior, LENOX presence and the optional engine-signature hook from one definition. Those behavior axes are emitted as root data attributes instead of being inferred from a hardcoded design name. The header now exposes a real design picker on desktop and mobile; URLs use `?design=<id>` and session hydration validates registry IDs while accepting the former `reality` field only as a migration fallback. Design changes continue to preserve chapter, local progress, locale, case, audit and project-brief state without reloading. Morph timers use one dedicated cancellable transaction slot so rapid changes cannot complete out of order.

The older Stage registry was inspected and its data-driven pattern was retained, but its retired OBSIDIAN/ALABASTER contents were not revived. Its scan-front transition controls only the legacy engine backdrop, so it is not wired as the Studio transition until it can coordinate DOM composition and world media as well. The inactive `LenoxExperience.tsx` path remains untouched in the dirty worktree and is explicitly legacy rather than a competing product truth.

## CLAUDE AUDIT — NON-VISUAL REMEDIATION COMPLETE (2026-07-19, Codex)

Claude's post-sprint code audit has been resolved without making visual-design decisions. The studio journey is now always present in the prerendered HTML while the entry ritual controls only visibility and interaction; the generated homepage contains all eight chapters, all three launch cases, the disclosed Website Intelligence prototype and exactly one `<h1>`. Unverified city claims were removed. Every case now carries visible, conservative provenance and meaningful image alt text.

The runtime no longer uses a hardcoded `0.62` film boundary: Clip A progress is mapped against the measured offset of the semantic `volkan` chapter through a pure tested timeline function. Shared hashes restore the requested chapter after entry; pre-entry navigation stores a semantic target instead of relying on a timing race. Reality morphs and locale changes rebuild the director against current measurements and restore chapter plus local progress. Project-brief visibility, values, audit state and the selected case survive morphs and session re-entry; persistence is debounced, flushed on `pagehide`, and local scroll position is committed at a throttled cadence rather than per frame.

LENOX's header status is derived from the actual intro phase, engine lifecycle and active prototype/morph/contact operation instead of a chapter-to-label lookup or a second stored state machine. Pointer input is coalesced to one animation-frame sample. Contact mailto values use RFC-safe percent encoding. Work tabs implement the complete tab/tabpanel relationship, roving focus and keyboard navigation. Homepage and `/ai-systems` have canonical URLs, language alternates, Open Graph and Twitter metadata; `NEXT_PUBLIC_SITE_URL` overrides the `https://volkanaistudio.com` brand fallback at launch. Default language remains English because that is explicit in the locked master plan. `lenox@volkanaistudio.com` remains the automated sender identity while `hello@volkano.dev` remains the human contact destination; these are separate mail roles.

**Verified after remediation:** `npx tsc --noEmit`; touched-file ESLint; `git diff --check` for the affected surface; 11/11 focused reducer, semantic-mapping, mailto and stage tests; and a clean Next.js production build. Static-output inspection measured eight homepage `data-chapter` sections, exactly one homepage H1, one `/ai-systems` H1, both canonical links, both OG/Twitter sets and complete EN/DE/x-default alternates. No browser or local-server process was started for visual acceptance in this pass. Visual composition, Mobile art direction, Arrival/Clip B media and the authored LENOX asset remain explicitly outside this technical acceptance.

## FWA MASTER EXPERIENCE ACTIVE (2026-07-19, Codex)

The public entrypoint now renders the new studio system from `src/app/studio/StudioExperience.tsx`. The isolated `YOU vs LENOX` decision is no longer part of the active homepage. Product contract: `docs/product/volkan-studio-master-experience.md`.

**Implemented, uncommitted:** one bilingual shared content/state kernel; session persistence; semantic chapter registry; approximately 1450svh Gravity Reef journey; early Selected Work; web design, LENOX, AI systems, Volkan, Recompose and Contact chapters; distinct Gravity Reef and Signal Editorial renderers; no-reload morph with chapter/local-progress restoration; deterministic disclosed Website Intelligence prototype; `/ai-systems` route; and a truthful mailto contact handoff. The existing WebGPU engine and film scrubber remain one renderer, one loop and one scroll authority.

**Media behavior:** the locked hero still and Clip A v2 development encode are wired without preloading the heavy film before entry. Mobile deliberately uses the static hero composition after entry. No fake Arrival asset is presented: until Distant Atmosphere and the six-second Arrival exist, WAKE uses a deterministic handoff into the hero. Clip B, portrait assets and the authored Blender GLB remain production gates.

**Verified this sprint:** TypeScript, touched-file ESLint, six focused tests and production build passed. Browser verification captured the desktop gate and exposed a real director reinitialization loop after SKIP; unstable callback identities were fixed. A final post-fix browser pass was blocked by the Playwright backend timing out, so the complete visual journey is not claimed as accepted. Volkan remains the visual judge. No local web server remains running.

## CODEX TECH LEAD ACTIVE (2026-07-18, night)

Volkan explicitly assigned Codex the Tech Lead role after Fable hit the weekly limit. Codex is the only runtime writer. Volkan owns visual acceptance; Codex no longer spends long tool runs trying to replace Volkan's direct visual judgment.

**Implemented in the first takeover pass:** Clip A v2 is wired into the existing hybrid harness (`gravity-clip-a-v2-dense.mp4`), but is NOT visually accepted yet. No Clip B generation and no Kling credit spend before Volkan's verdict. The currentTime fallback remains event-driven with one pending seek maximum and no private RAF loop. Film progression is derived from the real start offset of the WORK station, not a hardcoded global percentage, so copy, fonts and viewport changes cannot silently move the Clip A boundary.

**World Strip v2 is live in code:** six Director stations (`EXPERIENCE`, `SYSTEMS`, `LENOX`, `WORK`, `VOLKAN`, `CONTACT`), about 1420vh total score length, a dedicated LENOX act, large display typography, asymmetric dark content islands, and mobile horizontal navigation. The world is no longer globally dimmed for readability. The real section offsets remain the source of camera, station and film timing.

**Verified technically:** production build passes; `npx tsc --noEmit` passes; touched-file ESLint passes; stage suite passes 21/21 including new film-segment tests; live browser reports six stations, zero horizontal document overflow at desktop and 390x844, zero console warnings/errors, and reduced-motion disables the new reveal animation. Visual composition remains intentionally unapproved until Volkan scrolls it.

## HANDOFF TO CODEX (2026-07-18, late evening — Fable at session limit)

**Clip A v2 is generated and staged, unverified.** Kling v3.0, 10 s, 1080p, i2v from the locked `hero_keyframe_fixed.png`, with the team-corrected prompt (eye-level constant-altitude dolly, LEFT wave proximity pass ≤35 %, nothing spherical near camera, no cloud entry, calm stable end). Files: `public/flow-assets/gravity-clip-a-v2.mp4` (original, 1 keyframe), `gravity-clip-a-v2-dense.mp4` (GOP-12 measurement encode), `~/Downloads/clip_A_v2.mp4` + `clip_A_v2_lastframe.png` (candidate Clip B start frame — only valid if v2 passes).

**Codex takes over. In order:**
1. Verify v2 in the wired harness: swap `<video src>` in `LenoxExperience.tsx` to `gravity-clip-a-v2-dense.mp4`, run acceptance states **0/25/42/46/50/54/62/75/90/100 %** + slow REAL reverse scrub through 42–62 % (contract: Wiring Status section). The `?shotdev` flow + `[data-creation="complete"]` scroller works for automation; the historical frame dump was archived during repository consolidation.
2. If v2 passes → its real last frame seeds Clip B (~80 credits, 251 available). If it fails → report why, regenerate with adjusted prompt (do NOT silently change the creative contract).
3. Build the segmented journey timeline (ChatGPT's mapClamped film bands with hold zones) + World Strip v2 station structure (contract, PROPOSED section — needs Volkan's lock on structure/copy before final wiring).
4. Blender track: LENOX blockout only, never the world.

Kling CLI is logged in; use `--task-trace-id oxyfauaest9h3oaywyuzzzz2fe4qb2iz` for continuity. Film wiring (filmScrubber.ts, video element, one scroll truth) is browser-verified and stays.

**KILLER NOTES (Fable's last tokens — read before building):**
1. **iOS black-film trap (fixed, verify on device):** Safari does not present frames of a paused, never-played `<video>` — currentTime scrubbing shows black. The WAKE click now primes the film with `play().then(pause)` inside the user gesture (`wake` in LenoxExperience.tsx). If the iPhone FSV-gate test ever shows a black world layer, check this FIRST before blaming the scrub mechanism.
2. **mapClamped trap:** ChatGPT's film bands use fixed global percentages (`0.10, 0.38, …`). But director progress is `scrollTop/maxY` over DYNAMIC content heights — any copy/i18n/viewport change silently shifts every band. This is documented trap #4 in journeyDirector.ts ("Grenzen kalt, Posen warm"). Derive band edges from real `section.offsetTop` at refresh time (exactly like the director derives poses); never hardcode scroll percentages.
3. **`requestVideoFrameCallback`** (Chrome+Safari) tells you when a seeked frame is actually PRESENTED — use it for true scrub-latency measurement in the acceptance run and later to sync engine effects (lattice, light echo) to the displayed film frame instead of the requested one.
4. **`video.fastSeek()`** on Safari trades precision for speed (nearest keyframe). On the GOP-12 dense encode that's ±0.25 s — a legitimate iPhone fallback lever if exact seeks stutter, and worth measuring in the FSV gate.
5. The film `<video>` mounts unconditionally, also on the `gpuPath === "fallback"` path — decide deliberately whether the no-WebGPU reduced view should show the scrub world or a static poster (currently: it scrubs).

**Date:** 2026-07-17 (evening)
**Writer state:** no agent is currently writing. Codex finished the LENOX-Endfassung runtime sprint (~2.5 h, uncommitted); Fable completed the independent acceptance audit the same day. Volkan's joint visual session has NOT happened yet.
**Historical repository state at capture:** branch `codex/lenox-design-playground`; checkpoints `5c84922` (rescue), `473cdb6` (visual gate), `060f284` (handoff). The later one-main consolidation preserved the Wallow captures in Git and archived the audit and duplicate-agent leftovers outside repository history.

## Decision of 2026-07-18: LENOX character is FINAL

Volkan declared the pearl-opal baby-cephalopod (`~/Downloads/ChatGPT Image Jul 18, 2026, 01_50_45 AM.png` — with tiny nose and small mouth) as LENOX. See the CHARACTER DECISION block in `docs/agent-system/TASK.md`. The robot face with display frame is permanently vetoed. Fable's eyes-only counter-proposals are dead. The reference image must be committed into the repo (with Volkan's approval) as the canonical character anchor.

**Same day, evening — FIRST HYBRID WIRING LIVE (historical):** the first locked hero keyframe became scrub Clip A (`gravity-clip-a.mp4`, Kling v3.0, 10 s) and was wired as the world layer through `src/app/stage/filmScrubber.ts`. Browser verification measured proportional progress and a ~51 ms reverse jump. Those v1 encodes and the raw Director Strip were archived after v2 replaced them. The durable lesson remains: Kling clips ship with one keyframe, so raw `currentTime` scrubbing is unsuitable and the dense encode is only the current fallback behind the future FSV interface.

**Same day, second decision — WORLD LOCKED:** LENOX — THE GRAVITY REEF (sunlit sky coral-canyon, NOT underwater) with a five-beat scroll score and one Controlled Chromatophore-Proximity-Pass. Binding contract: `docs/product/gravity-reef-scroll-score.md`. Team consensus Volkan+Fable+ChatGPT+Codex; Gemini's Three.js background-shader proposal rejected (architecture conflict — film scrubbing stays the back layer). Next: final master still approval → scene stills → five beat clips per the score's production rules.

## The Two Decisions of 2026-07-17 (supersede older docs below this file's date)

1. **LOOK — FINAL:** the world is bright and colorful (wonder/awe; reference: Volkan's FPV video). The dark graphite/cyan direction is permanently retired after Volkan's third veto. Any doc or code presenting dark as default is stale.
2. **ARCHITECTURE — the three-layer hybrid:** scroll-scrubbed pre-rendered wonder-world (back) + live WebGPU LENOX on transparent canvas (middle) + semantic DOM with dark content islands (front); one scroll drives all. Pipeline: Kling → Remotion (skills installed in `.agents/skills/`) → FSV (candidate, iPhone gate pending) → engine overlay. See `CLAUDE.md` / `AGENTS.md` for the full truth, `docs/agent-system/TASK.md` for the assignment.

## Runtime State (Codex sprint, 2026-07-17, uncommitted)

Built on the existing engine (no second renderer/state machine):
- **Phase-1 procedural body** at the vessel pivot: 2 lead + 4 support arms (`src/flow-engine/lenox/lenoxBody.js`), response hierarchy (face → core → lead → support), incommensurate idle frequencies, scroll-driven curl.
- **Intent API:** `setLenoxIntent` (rest/observe/guide/confirm) through `engineBridge`; engine owns easing; confirm auto-decays ~1.9 s.
- **Canonical signals** energy/attention/tension: drive body TSL material, MLS-MPM field uniforms, and CSS tokens (`--lenox-energy/attention/tension`, 12 Hz throttled, no React re-render).
- **GRAVITY beats** baked in the creation kernel per contract; living field ~3,072 desktop / 2,048 mobile particles after arrival.
- **Eye-rig A/B** (lids/glint/convergence) as toggle over the control face (key `i`); control face remains the baseline.
- **Device-loss → static fallback**; mobile banded composition; reduced motion path.

**Fable's independent audit verified:** tsc clean, 19/19 stage tests, production build, console clean (desktop/mobile/reduced), perf probe ~1.1 ms desktop / ~1.55 ms mobile engine submit, flow WAKE → creation → GRAVITY → scroll works, desktop hero composition strong.

**Open audit findings (must be fixed before the joint session):**
1. Mobile STAGE/FALLBACK section: LENOX head overlaps text (same class as the fixed SYSTEMS/WORK bugs).
2. Body colors are baked constants in `lenoxBody.js` — must become swappable uniforms (look-decision compliance; current dark values are retired placeholders).
3. Reduced-motion particle budget measured 3,072 (claimed 2,048) — clarify.
4. Eye-rig A/B was not independently verified (`__LENOX_SHOT__` was not exposed in the audit run); the former local design-audit dump was archived during repository consolidation.

## What Happens Next (in order)

1. Codex fixes audit findings 1+2, clarifies 3+4 (≈1 h).
2. Joint test session (Volkan + Fable + Codex): desktop, mobile 390×844, reduced motion, eye A/B — behavior and silhouette judged, NOT the retired dark look.
3. Look round: Volkan generates master-still variants (prompt delivered in chat 2026-07-17); his pick anchors the creative contract.
4. Fable delivers the creative contract: World Strip (whole page as one vertical composition), typed Scroll Score, all Kling scene/dive prompts, world-lattice spec.
5. Kling production → FSV iPhone spike → hybrid wiring.

## Reuse Boundary (condensed)

Reusable: protected PLAY/WAKE/First Contact flow and reducers, `compositionMode`, single Journey scroller + director + engine pose bridge, single WebGPU loop, intent/signal plumbing, i18n content as future shared model.
Legacy/direction-specific: OBSIDIAN/ALABASTER signature IDs and tokens, dark-world materials and presets (retired by the look decision), current station copy staging pending the bright art direction.

## Important Files

- `CLAUDE.md` / `AGENTS.md` — refreshed 2026-07-17, both carry the hybrid + look decision + coding discipline
- `docs/agent-system/TASK.md` — active assignment (LENOX Endfassung; LOOK DECISION block on top)
- `src/flow-engine/lenox/lenoxBody.js`, `src/flow-engine/engineBridge.ts`, `src/flow-engine/types.ts` — the new body/intent/signal surface
- `docs/review/wallow-reference-2026-07-15/` — protected reference
- `docs/product/lenox-design-playground-manifesto.md` — product definition (playground framing still canonical)

Historical detail from before 2026-07-17 (old gate checkpoints, interrupted rescue notes) was superseded by this handoff; consult git history of this file if needed.
