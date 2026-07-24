# VOLKAN AI STUDIO — Master Experience Contract

> **SUPERSEDED 2026-07-24:** Historical implementation contract. The active
> product truth is `/PRODUCT_CONTRACT.md`; the existing registry, state and
> semantic-position implementation remain reusable evidence.

**Historical status:** Active from 2026-07-19 until superseded on 2026-07-24.

## Product Promise

VOLKAN AI STUDIO is an independent web design, redesign and AI systems studio. The site proves the work through one continuous experience: real selected work appears early, LENOX is a persistent living interface, and the same content can be recomposed into an open set of equally intentional designs without a reload.

## Design Registry

- The launch registry contains **GRAVITY REEF** and **SIGNAL EDITORIAL**. It is not a two-state product model; more designs will be registered over time.
- **GRAVITY REEF** proves art direction, spatial storytelling, film scrubbing and live WebGPU integration.
- **SIGNAL EDITORIAL** proves typography, grid systems, semantic content architecture and precise DOM choreography.
- Every registered design renders the same bilingual content model and preserves the same experience state.
- `src/app/studio/designRegistry.ts` is the active source of design IDs, labels, composition class, world-media behavior, LENOX presence and optional engine signature.
- `DesignId` and runtime validation are derived from that registry. New code must not introduce `reef | signal` unions, renderer ternaries or binary toggle logic.
- The header exposes an N-design picker. Shareable variants use `?design=<id>`; the old `?reality=` parameter is accepted only as a migration fallback.
- A design change preserves the active chapter, local chapter progress, selected case, locale, audit input, project brief and LENOX status.

The older Stage signature registry remains implementation reference, not a second product truth. Its data-driven lookup and optional engine-signature hook are reusable. OBSIDIAN and ALABASTER remain retired, and their backdrop-only scan transition must not be presented as a complete Studio design transition unless it can also coordinate DOM composition and world media.

## Canonical Journey

1. Distant Atmosphere
2. Arrival
3. LENOX handoff
4. Hero Promise
5. Selected Work
6. Web Design and Redesign
7. Meet LENOX
8. AI Systems
9. Volkan
10. Recompose
11. A selected registered design
12. Contact

The homepage chapters span approximately 1450svh. Selected Work follows the Hero Promise. The launch cases are Klein Paris, Manaleaf and LENOX / VOLKAN AI STUDIO R&D.

## Truth and Disclosure

- Website Intelligence is a deterministic frontend prototype, visibly labelled `INTERFACE PROTOTYPE · NO LIVE WEBSITE SCAN`.
- No AI scan, phone call, calendar action or email automation is implied without a real backend.
- Public copy does not claim awards, invented results or code superiority.
- `BOOK A CALL` uses an honest mailto handoff until a public calendar exists.

## Runtime Laws

- One WebGPU renderer and one render loop.
- One authoritative scroll director drives film, engine and semantic chapter state.
- LENOX is live and never baked into world media.
- React sends discrete intents; continuous motion remains inside the engine.
- Desktop may scrub world film. Mobile uses its own portrait composition and static world keyframes after the Arrival.
- No heavy scroll film preloads before deliberate entry.
- Design-specific film and engine behavior is read from the active registry entry, never inferred from a hardcoded design name.

## Asset Gates

The coded experience must remain honest when final production assets are absent. Distant Atmosphere, the six-second Arrival, Clip B, portrait world assets and the authored Blender GLB are separate production gates. Placeholder behavior may prove orchestration but must not be described as final visual delivery.

## Active Implementation

- Shared state and content: `src/app/studio/`
- Active design registry: `src/app/studio/designRegistry.ts`
- Public homepage entry: `src/app/page.tsx`
- AI systems route: `src/app/ai-systems/page.tsx`
- Existing live engine: `src/flow-engine/`
- Development film adapter: `src/app/stage/filmScrubber.ts`
