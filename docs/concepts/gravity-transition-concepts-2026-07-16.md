# GRAVITY Transition Concept Round

**Date:** 2026-07-16
**Author:** Fable (Claude Code), creative lead for this round
**Status:** Concept exploration for Volkan's review. No runtime code changes. Codex `gpt-5.6-sol` (high reasoning) completed the read-only feasibility pressure-test on 2026-07-16 — verdict in Part 6. The recommendation in Part 3 carries Codex's two precisions.

Evidence used: live runtime at `localhost:3000` (PLAY void → WAKE → materialization → First Contact → LENOX-decides path → current ivory world), Wallow captures under `docs/review/wallow-reference-2026-07-15/`, the historical GRAVITY board under `docs/review/lenox-design-playground-visual-gate/`, and the canonical docs.

---

## Part 1 — Signature Creation: `WAKE -> LENOX opens GRAVITY`

### Concept A — THE COLLAPSE (gravitational genesis, fully live)

**Premise.** GRAVITY is not built and not revealed. It *condenses*. LENOX does not gesture or work — he decides, and mass obeys. The same particle matter that became his body now becomes his home.

**Desktop beats (~9–11 s):**

1. **Decision** — the First Contact panel dissolves. LENOX stills completely. His visor signals drop to one slow deep pulse. The residual particles of the void freeze mid-drift. One beat of total silence.
2. **Fall** — every free particle begins to fall toward a locus behind and below LENOX. Falling matter draws faint streaks. The camera starts a slow dolly forward, caught by the same pull.
3. **Accretion** — matter orbits, flattens into a tilted disk. A light source condenses at its center. The disk's plane is secretly the future page plane. Brightness swells to near-white at the core.
4. **Precipitation** — architecture crystallizes out of orbit: the first chapter's typographic mass and content geometry condense in depth layers. Excess matter settles into a persistent atmosphere of dust and slow light.
5. **Arrival** — the camera locks to the scroll rest pose. LENOX takes his home stance *inside* the environment, not beside it. The world stays alive: residual orbiting dust, breathing light, deep parallax. Settled matter keeps drifting slightly downward — the drift *is* the scroll affordance.

**Mobile (~6–7 s, separately composed):** the fall axis is straight down the screen; the disk is seen edge-on as a glowing horizon band; typography condenses inside a safe readable column; LENOX anchors the top third. Not a cropped desktop — a vertical recomposition of the same five beats.

**LENOX role / emotional logic.** The still center of mass. Authority expressed as calm: the world falls into place because he is there. The transition literally explains the world's name.

**Live vs authored.** 100% live WebGPU riding the existing MLS-MPM particle field plus new attractor choreography and environment condensation. Authored media only as optional baked environment assets (dust/nebula backdrop textures), never as motion carrier. No seam exists because nothing is handed off.

**Reduced motion.** Skip beats 2–4: brief dark hold, fade into the formed, already-living GRAVITY.

---

### Concept B — THE DESCENT (falling into his world, hybrid candidate)

**Premise.** You don't watch GRAVITY get built — you fall into where it has always been. WAKE happens at the surface; GRAVITY is below.

**Beats.** LENOX acknowledges the visitor → tips back and drops out of frame → the camera plunges after him down a shaft of dust, strata, and light bands → deceleration → the landing *is* chapter one. The site's scroll is the continuation of the same descent: scrolling GRAVITY means descending further through his home.

**LENOX role / emotional logic.** The guide who jumps first. Trust and plunge. The transition teaches the scroll grammar in its own body.

**Desktop/mobile.** The strongest native mobile story of the three — vertical fall equals vertical scroll. Desktop needs added lateral drama (strata parallax, shaft asymmetry) to avoid feeling like a narrow tube.

**Live vs authored.** Candidate hybrid: live vessel plus an authored volumetric shaft (Blender-baked layers or prerendered environment), the seam hidden inside deceleration blur. Medium seam risk; the authored pipeline gates the signature moment.

**Reduced motion.** Cut the fall; dissolve directly to the landed chapter.

---

### Concept C — THE ECLIPSE BLOOM (authored filmic hybrid)

**Premise.** One cinematic authored shot delivers the thing live rendering cannot: planetary scale. LENOX's visor light swells until his silhouette eclipses the whole viewport — the cover is diegetic, his own body. Inside the eclipse an authored sequence shows GRAVITY forming at vast scale; the camera pulls back through the formed world and hands off to live runtime on an exact camera/material/LENOX-state boundary.

**LENOX role / emotional logic.** He is the shutter between void and home. Awe; a film moment.

**Desktop/mobile.** Requires a separately authored mobile cut — an authored 16:9 master cannot be cropped into a 9:19.5 frame without losing the composition that justifies it.

**Live vs authored.** Authored center (AVAL / Blender / prerendered), live bookends. Highest visual ceiling; highest seam, pipeline, weight, and localization risk. The signature moment becomes hostage to an asset pipeline that does not yet exist.

**Reduced motion.** Eclipse to black, fade into the live home.

---

## Part 2 — Universal World Switch: `ANY WORLD -> LENOX -> ANY WORLD`

### Switch 1 — THE BLINK

LENOX closes his eyes. Because his visor is an established light source, the world's light dies with them — full darkness is the cover. Atomic swap. His eyes open, and the *new world's own light* is what reveals it. ~1.2 s normal, ~0.6 s reduced motion.

Emotional logic: every world exists inside his attention. Purely live, trivially source-target independent, never reads as loading because the visible actor is the visible cause. Cost: each world must define one "lit by LENOX's attention" reveal accent — exactly the per-world `reveal` the architecture already requires.

### Switch 2 — THE INDRAW

The current world loses cohesion and returns to particle matter, drawn back toward LENOX for one beat — a brief return to the origin medium — then the target precipitates. Strongest continuity thesis (all worlds are one matter; symmetric with the protected opening and with THE COLLAPSE). Cost: every world must implement a credible "dissolvable" cover state, which violates the cheap-per-world principle; longer than a blink; risks feeling like a small copy of the signature creation each time.

### Switch 3 — THE TRANSIT

LENOX crosses the viewport toward camera; his mass fills the frame like a planetary transit — a geometric wipe. The swap happens behind his body; he recedes already staged inside the target world. Fast and physical, works at any scroll position. Risks: at mobile sizes the vessel must scale absurdly to guarantee coverage, and a repeated fly-by degrades into a gag.

---

## Part 3 — Recommendation

**THE COLLAPSE + THE BLINK**, with one structural idea folded in from THE DESCENT: the final beat of the collapse aims its residual matter drift *downward*, so arrival itself teaches that scrolling continues the motion the world was born from.

Why this pair:

- **Identity.** The name is the mechanism. GRAVITY's signature event is gravity acting; no metaphor is borrowed.
- **Continuity.** One substance from `PLAY` to home: void particles → LENOX (protected materialization) → GRAVITY (collapse). The product story "the website is the AI demonstration" stays literal — everything the visitor sees is the same live matter.
- **Feasibility.** The collapse stays fully live on the existing engine — with Codex's precision: "fully live" means a deterministic GPU flight choreography (an exclusive `gravityCreation` kernel after the proven rift-flight pattern, with curl/noise masking the controlled interpolation), not a physically balanced true orbit inside the 64³ MLS-MPM grid. No authored-media pipeline gates the signature moment. C remains an enrichment path if an authored asset later proves itself.
- **Typography boundary (Codex precision).** "Typography condenses out of matter" means particle mass → DOM glyphs: particles condense into line masses, rough letter shadows, and architectural plates; the final readable contours always come from pre-mounted, pre-measured DOM revealed by the same master scalar. Exact engine-rendered glyphs would be a separate rendering project with no visible product gain.
- **Contrast economics.** Spectacular once, minimal always. The blink is the cheapest possible per-world contract (one reveal accent), scales O(N), and its smallness makes the collapse feel bigger.
- **Honest fallbacks.** Both concepts degrade gracefully under reduced motion and WebGPU failure without faking parity.

**LENOX vessel note.** During Decision and Fall the current friendly smile works against mass-driven gravitas. Recommend a GRAVITY stage profile in which the visor drops to instrument-calm (no smile, slow single pulse) for beats 1–3 and warmth returns only at Arrival. This is staging, not a vessel reopening.

**Open creative decisions for Volkan:** light temperature of GRAVITY (deep blue-black space vs warm dust); how completely the ivory/Fraunces legacy is retired inside GRAVITY (recommendation: completely — GRAVITY needs its own typographic mass); whether sound (opt-in) joins the collapse at all.

---

## Part 4 — Storyboard of the recommendation (textual; visual boards follow)

**Desktop `WAKE -> GRAVITY`:**

| # | Beat | Duration | Camera | LENOX | Matter |
|---|------|----------|--------|-------|--------|
| 1 | Decision | 1.5 s | static | stills, single slow pulse | void particles freeze |
| 2 | Fall | 2.5 s | slow dolly in | motionless center | radial infall, streaks |
| 3 | Accretion | 2.5 s | drawn in, slight tilt | silhouette against core light | disk forms, core brightens |
| 4 | Precipitation | 2.5 s | decelerates to rest pose | takes home stance | typography/geometry condense in depth |
| 5 | Arrival | 1.5 s | locked, breathing | warmth returns | dust settles, drifts downward |

**Mobile `WAKE -> GRAVITY`:** same beats at ~0.65× duration; fall axis vertical down-screen; disk as edge-on horizon band; content condenses in a single readable column; LENOX top-third anchor.

**Universal switch (any pair):** close (~0.4 s, world light dies with visor) → covered atomic swap (imperceptible; preparation happened before closing) → open (~0.8 s, target's reveal accent lights the new world). Reduced motion: 0.6 s total crossfade through dark.

---

## Part 5 — Feasibility questions for Codex (read-only pressure-test)

1. Can the existing MLS-MPM field and engine bridge support an attractor-driven collapse choreography (radial infall → disk orbit → condensation) without breaking the single render loop or the protected WAKE materialization path?
2. What is the realistic cost of "typography condenses out of matter" — engine-rendered glyph targets vs DOM reveal choreographed to engine state? Where is the honest boundary?
3. Is a persistent living environment (dust, light, parallax behind a scrolling DOM) sustainable at 60 fps desktop / stable mobile on mid hardware with the current renderer architecture, and what budget does it leave the DOM layer?
4. Does the blink cover mesh cleanly with the covered-swap transaction in `docs/architecture/lenox-design-playground-architecture.md` §3, given current stage-state ownership?
5. Which parts of the current transformTimeline / journeyDirector / buildTimeline infrastructure are reusable for the collapse, and which are ALABASTER-specific presentation that would fight it?
6. Hidden risks: device-loss during collapse, reduced-motion divergence, font-loading interaction with condensation timing, scroll capture during the arrival beat.

---

## Part 6 — Codex `gpt-5.6-sol` feasibility verdict (read-only, 2026-07-16)

Overall: **THE COLLAPSE + THE BLINK is viable in the existing repository.** No question is infeasible; five of six are feasible-with-cost, timeline reuse is cleanly feasible. Full transcript preserved from the pressure-test run:

1. **Attractor choreography — feasible-with-cost.** The bridge owns exactly one rAF loop (`engineBridge.ts:390`, `app.js:1909`); the MLS-MPM kernels already provide gravity/noise/pointer forces (`mlsMpmSimulator.js:825`), per-particle return/recall/settle targets (`:942`), tangential swirl (`:984`), and exclusive alternative compute paths like `postEnterRiftFlight` (`:1655`), plus a bridge master scalar (`app.js:1024`). Missing: a general spatial attractor (gravity is only a down vector today). Risks: `LenoxEyesDrive` writes settle/swirl/particle-count per frame in `present` state and would fight an external collapse controller (`lenoxEyesDrive.js:934, :1160`); particle count is locked at ≤16,384 desktop / ~4,096 mobile; a physically real orbit in the 64³ grid risks overshoot and fluid chatter. **Cheaper equivalent:** exclusive deterministic `gravityCreation` flight kernel (rift-flight pattern) with analytic seeded targets; curl/noise masks the interpolation as fluid behavior.
2. **Typography condensation — feasible-with-cost.** No glyph/SDF renderer exists; engine glyphs would need font parsing, layout, localization duplication. Honest boundary: particles announce typographic mass; readable glyphs are DOM — pre-mounted, inert, measured, masked, revealed by the master scalar (`buildTimeline.ts:29` priming pattern reusable; `useDecode.ts:37` must not expand to full text surfaces).
3. **Sustained living environment — feasible-with-cost; 60 fps not yet a verified fact.** Current cost drivers: 32,768 desktop start particles, AA on, DPR up to 2.0 (`engineBridge.ts:78`), MRT+bloom (`app.js:1211`); `__LENOX_PERF__` measures CPU tick, not GPU time (`engineBridge.ts:457`); representative profiling is explicitly open (`CURRENT.md`). Budget proposal: engine ≤10–11 ms, DOM ≤3 ms typical. Mobile needs quality tiers (DPR 1.0–1.5, ≤4k dust, reduced bloom, honest 30/45/60 targets). **Cheaper equivalent:** full solver only during creation; after Arrival lock/reduce the sim to 2–4k dust particles + uniform-driven light breathing and camera parallax.
4. **Blink vs covered-swap transaction — feasible-with-cost.** Concept fits §3 exactly, but `ready` is terminal today (`stageState.ts:12`); no preparing/closing/covered/swapping/revealing/recovering states, no registry/anchor/rollback paths; the existing blink is a stochastic ~0.32 s ambient blink with no hold or covered callback (`lenoxEyesDrive.js:405, :643`) and darkens only the eyes. Transaction should belong to React; the bridge receives a deliberate close/hold/open command. **Cheaper equivalent:** full-viewport black DOM scrim synchronized to the eyes; swap at opacity 1 — covers DOM, canvas, and device loss reliably.
5. **Timeline reuse — feasible.** Reusable: master-scalar + cleanup + reduced-motion branch + completion signal from `transformTimeline.ts:36`; `primeBuild()` and one-clock rule from `buildTimeline.ts:38`; authoritative scroller/pose bridge/font refresh from `journeyDirector.ts:30`; director already starts post-build (`Journey.tsx:103`). ALABASTER-specific and hostile to GRAVITY: signature IDs, `applySignatureTokens`, scanfront, env swap, fixed 5.2 s run, hairlines/module snaps/heading decode, the EXPERIENCE/SYSTEMS/WORK/VOLKAN/CONTACT poses and ivory plate composition. Playing `transformTimeline → buildTimeline` in sequence would be two ceremonies; build one `gravityCreationTimeline` master instead. First-slice shortcut: keep reducer names (`transforming` = collapse, `building` = final DOM settle) under one creation contract.
6. **Hidden risks — feasible-with-cost, must close before production.** Device loss: Three r175 detects loss (`WebGPUBackend.js:211`) but the app has no recovery path (`LenoxExperience.tsx:134` logs only) → under black cover, reinit once or commit to a static formed-GRAVITY fallback; never resume lost particle state. Reduced motion: engine freezes the preference at init while transform/journey re-query it (`LenoxExperience.tsx:125, :417`) → snapshot per transaction; same semantic end state. Fonts: all `display: swap` (`layout.tsx:10`), director corrects reflow late (`journeyDirector.ts:122`) → mount and measure GRAVITY DOM inert before starting; never wait on font discovery under the blink. Scroll: mobile rail `touch-action: pan-x` can capture vertical drags (`Journey.module.css:349`) → release input only after final pose + anchor + director init. Resize: composition frozen only during `building`, not `transforming` (`LenoxExperience.tsx:105`) → freeze for the whole creation transaction; re-measure at Arrival.

**Codex's closing recommendation:** keep the Creative Contract recommendation, with the two precisions now folded into Part 3. The cheapest production-viable version preserves exactly the visible promise: live matter falls, rotates, and forms GRAVITY; real typography crystallizes out of that mass; LENOX's blink covers every later atomic world swap.
