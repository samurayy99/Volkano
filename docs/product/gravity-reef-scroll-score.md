# LENOX — THE GRAVITY REEF · Scroll Score (LOCKED 2026-07-18)

**Status:** Team-locked (Volkan + Fable + ChatGPT + Codex; Gemini's shader-background proposal rejected as architecture conflict). This document is the binding beat contract for the first scroll-background film. Supersedes the three underwater pitches of 2026-07-18.

## World Definition

A sunlit coral-canyon world floating freely in open atmosphere. **Not underwater** — no sea floor, no fish, no bubbles-as-water-sign, no temples, no ruins, no symbols. Monumental biomorphic coral-mineral arches form the canyon corridor; pearl-opal surfaces; volumetric light rays; a living glowing core as the destination.

**Gravity DNA (visible in every beat):** transparent liquid ribbons flow upward · single droplets hang stable in the air like glass planets · reef plates lean at impossible angles · clouds and atmosphere partly BELOW the camera · particle streams curve along invisible gravity fields.

**Palette:** coral-rose · seafoam mint · pearl white · warm golden light (LENOX's material family — the world and the being share one biology). **Nothing built, only grown** (locked): no towers, pagodas, spires-as-architecture, or any civilization trace.

**HERO KEYFRAME LOCKED (2026-07-18 evening, team vote + Volkan): `hero_keyframe_fixed.png`.** This frame is now the canonical pivot asset AND the de-facto master law of the universe — all scene stills and clips derive from it. Its world DNA supersedes the earlier coral-canyon masters (v2/final lineage retired): **silky rounded pearl-wave formations** in seafoam mint and pearl white, carrying LENOX's plump glossy skin language, with delicate coral-rose sprig accents in the near foreground only; small crystal droplets upper right; cloud valley below opening forward into a **rich gold-amber glowing heart** (deepened for creature contrast); bright blue sky, pearl daylight, sun high behind camera-left. Lineage: ChatGPT candidate `05_01_55` (team vote) → Fable's surgical fix pass (droplet shrunk/moved, mid-distance filigree thinned, core warmed) → locked.

**LENOX is never baked into the film.** The film is world-only; LENOX lives on the live WebGPU layer above it.

## The Five Beats

| Scroll | Beat | Content |
|--------|------|---------|
| 0–18 % | **Open Sky** | Wide, calm. Clear horizon and depth orientation. First floating reef plates. |
| 18–42 % | **Canyon Approach** | Monumental arches define the corridor. Upward-flowing liquid ribbons establish bent gravity. |
| 42–62 % | **Chromatophore Pass** | One large reef arch passes the camera laterally in controlled proximity. Broad, slow pearl-cyan and coral pigment veins — the same visual biology as LENOX's skin. |
| 62–84 % | **Gravity Bloom** | Proximity resolves into strong width. Floating droplets, curved particle paths, impossibly tilted reef plates. |
| 84–100 % | **Living Heart** | Several upward streams converge in an open, sunlit coral bloom. A place, not an object. |

## Proximity-Pass Safety Bounds (non-negotiable)

- Constant linear forward motion; no zoom, orbit, tilt, or altitude change.
- The passing surface occupies ~35–50 % of frame, never full-frame; opposite wall and vanishing point stay visible throughout.
- No geometry closer than safe visual distance; no transparency membrane directly in front of the lens; no heavy motion blur.
- The same landmark must remain traceable before, during, and after the pass (anti-teleportation).
- Exactly one proximity pass in the first film.

## Clip Architecture (corrected 2026-07-18, ChatGPT/Codex round — Fable's original five-clip derivation was wrong)

**The five beats are dramaturgical states, not production files. The film is TWO clips with ONE seam.**

| Clip | Scroll | Content |
|------|--------|---------|
| **A — Canyon Passage** (~12–15 s) | 0–62 % | Open Sky → Canyon Approach → Chromatophore Proximity Pass → ends in a bright, low-motion opening AFTER the pass (never during proximity) |
| **B — Gravity Bloom** (~12–15 s) | 62–100 % | Starts image-to-video from the REAL last frame of Clip A → widening canyon → Gravity Bloom → Living Heart → stable final hold |

Seam discipline (the only real transition, at 62 %): Clip A ends with ~0.5–1 s of very slow motion; Clip B begins from A's last clean frame with the same composition and ~0.5–1 s of calm; identical camera axis, height, FOV, light; no new landmark may appear at the seam; a light crossfade may polish but never substitute for geometric continuity — the living WebGPU lattice can mask the residual seam.

Standard light clause for every video prompt (ChatGPT's formulation, adopted verbatim):
> The entire sequence remains in the same bright pearl daylight with the sun fixed high behind camera-left, constant exposure, constant white balance and no shift toward sunset, dusk, darkness or underwater blue.

## Production Rules (lessons from the 2026-07-17/18 test generations)

1. **Pipeline:** master still (text-to-image) → scene stills (image-to-image, one universe) → clips (image-to-video) → transitions from REAL boundary frames. Never text-to-video for production clips.
2. **Camera sentence is mandatory** in every video prompt: slow continuous forward glide at constant height and speed, never turning/tilting/stopping/pulling back; world continues beyond the final frame.
3. **Light constancy is mandatory** in every prompt: same time of day and light direction across ALL five beats, identical in first and last frame of every clip (Kling drifts day→dusk otherwise — proven failure).
4. **Kling flags:** always set `resolution` explicitly (v3.0 defaults to 4k) and `prefer_multi_shots false` (defaults to true and produces hidden cuts — proven failure).
5. **One seam only, at 62 %**, in the bright calm zone after the proximity pass, on feature-rich low-motion frames (see Clip Architecture). Beat edges are scroll-score markers, not file boundaries.
6. Clips contain world only: no characters, no creatures, no text, no logos, no watermarks (use watermark-free renders).
7. Acceptance: Director Strip over fixed scroll states + real scrub test, desktop and mobile (9:16 is its own composition). Volkan judges on video.

## THE ARRIVAL (locked 2026-07-18, Volkan's idea, team-refined)

A short authored flight from a distant pearl atmosphere into the Gravity Reef, ending frame-exact on the hero. **Never an autoplay pre-gate.** Placement LOCKED (team round + Volkan's lock): **the existing WAKE LENOX click starts the flight.** PLAY WITH ME remains the playful approach before it; the flow is: particle play → WAKE LENOX → THE ARRIVAL → hero keyframe → LENOX materializes live → First Contact → scroll scrubbing.

**Story:** bright distant atmosphere (NO recognizable Earth, no continents — brand rule) → approach through iridescent cloud layers where physics already breaks (streams bend upward, droplets hover) → cloud breakthrough → THE GRAVITY REEF below, clouds under the camera → flight decelerates → final 0.6–0.8 s nearly still → last frame IS the hero. LENOX is never in the video; he materializes live over the hero at handoff and notices the visitor — the moment that proves the being is real and the film is not.

**Production (tech-lead binding):** the **hero keyframe is the pivot asset** — one still from the master-still family serving as arrival end frame, scrub Clip A first frame, handoff poster, and skip target. Arrival is generated image-to-video with `tail_image` = hero keyframe (Kling v2.5/v2.6, requires 1080p), start image = distant-atmosphere still from the same universe. Clip A starts i2v FROM the hero keyframe. **Seam guarantee is deterministic, not AI-trusted** (correction round, ChatGPT/Codex): `tail_image` steers toward the hero but encoding/residual motion can shift the last decoded frame — so (a) Remotion blends the arrival's final 0.6–0.8 s into the exact canonical hero still, and (b) the frontend always hands off THROUGH the still: arrival ends → hero still holds → Clip A starts behind the identical still only once its first frame is ready. The still is also the skip target, error fallback, and reduced-motion state. Do NOT attempt one master generation covering both motion regimes (fast decelerating descent + slow constant glide = proven mixed-choreography failure).

**UX rules (merged Codex/ChatGPT):** 6–8 s max · SKIP visible from first moment, plus Esc · muted, playsInline · scroll locked during flight · skip lands on the identical hero frame, never black · full play once per session, returning visitors go straight to hero (optional "Replay Arrival") · `prefers-reduced-motion` skips entirely · mobile gets its own 9:16 composition · no loading screen before it.

**Asset count stays controlled:** 1 arrival video + 2 scrub clips. Production order: master still final → hero keyframe → Clip A (core product) → arrival → Clip B.

## Wiring Status & Acceptance Additions (2026-07-18, post-review Codex)

The three-layer wiring is live as a prototype (film → live LENOX → DOM, one scroll truth) and stays. Bindings from the review: **Clip A v1 is NOT the final asset** (sphere pass instead of wave pass, cloud immersion at the end — do not derive Clip B from its end frame). Acceptance states for any clip covering the proximity pass: **0/25/42/46/50/54/62 %** plus one slow real reverse scrub. The 0–62 % / 62–100 % clip-to-scroll mapping applies once Clip B exists (full-range mapping is spike-only). `preload="auto"` on the film is test-only — production uses the poster/handoff/FSV strategy. Scrubber is event-driven (no polling loop).

## WORLD STRIP v2 — Scroll Extension (PROPOSED by Fable per Volkan's directive, awaiting team lock)

Volkan's directive: the page is too short — stretch the journey, big display type, strong cards, world-class scrubbing. Proposal (station structure; film beats stay independent score markers):

| # | Station | ~Length | Content pattern | Film beat |
|---|---------|---------|-----------------|-----------|
| 01 | HERO / ARRIVAL | 130 vh | Giant display type, one line, scroll cue | Open Sky |
| 02 | **LENOX** (new — his own chapter) | 220 vh | His name huge; 3–4 dark cards: live-not-video, senses (gaze/intent), states; he *reacts* while you read about him | Canyon Approach |
| 03 | EXPERIENCE | 200 vh | Big-type lead + module cards | Canyon Approach |
| 04 | SYSTEMS | 180 vh | **Breather band during 42–62 %:** one giant word, no cards (proximity pass owns the eye) | Chromatophore Pass |
| 05 | WORK | 240 vh | Case cards (existing CaseTheater) | Gravity Bloom |
| 06 | VOLKAN | 160 vh | Portrait/statement, big type | Gravity Bloom |
| 07 | CONTACT | 180 vh | Living Heart + uplink | Living Heart |

~1310 vh total (≈ doubles today's journey). Rules: content islands are compact and dark (never dim the world); the 42–62 % band stays content-light; big type is display-weight and short; every station keeps a calm film view behind its densest card cluster. "World-class scrubbing" = the FSV/WebCodecs spike moves up in priority (the one-keyframe finding makes it mandatory for shipping).

## Content-Layer Note

The 42–62 % proximity pass is the film's highest-motion band — keep DOM content islands out of it; place content beats in Open Sky, Gravity Bloom width, and Living Heart.
