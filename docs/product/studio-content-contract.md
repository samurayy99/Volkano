# STUDIO CONTENT CONTRACT

**Locked:** 2026-07-25 by Volkan. Written by Fable. Binding for every design.

This file is the source of the words. `src/app/studio/content.ts` implements it and
nothing else may introduce visible copy. If a design needs different words, the design
is wrong.

## The rule

**One content kernel, three designs.** The same five chapters, the same sentences, in
both locales. A design changes typography, colour, rhythm, density and composition —
never a word. That equality is the argument the page makes about itself: chapter 02
claims it, and the switch proves it in front of the visitor.

No case studies. No client logos. No numbers, no "trusted by", no claim that cannot be
verified today. The studio is new; the page is the work sample.

## Chapters

| # | id | nav EN / DE | span |
|---|----|-------------|------|
| 01 | `hero` | Studio / Studio | 140vh |
| 02 | `principle` | Principle / Prinzip | 200vh |
| 03 | `capabilities` | Capabilities / Leistungen | 220vh |
| 04 | `lenox` | Lenox / Lenox | 180vh |
| 05 | `contact` | Contact / Kontakt | 140vh |

Retired on this date: `work` (case studies), `services`, `ai-systems`, `volkan`,
`recompose`. The design switch that lived in `recompose` now sits in `principle`, where
the copy makes the promise it fulfils. Depth that no longer fits the homepage belongs on
`/ai-systems`.

## The words

```
01 — HERO
EN  WEBSITES PEOPLE REMEMBER. / AI SYSTEMS THAT KEEP WORKING.
    Independent studio for digital design, strategic redesign and applied AI.
    [ START A PROJECT ]
DE  WEBSITES, DIE BLEIBEN. / AI-SYSTEME, DIE WEITERARBEITEN.
    Unabhängiges Studio für digitales Design, strategisches Redesign und angewandte AI.
    [ PROJEKT STARTEN ]

02 — PRINCIPLE
EN  THE STUDIO IS THE DEMO.
    One message. Three complete websites.
    The content stays fixed. Everything else changes.
    [ 01 · 02 · 03 ]
DE  DAS STUDIO IST DIE DEMO.
    Eine Botschaft. Drei vollständige Websites.
    Der Inhalt bleibt. Alles andere wechselt.

03 — CAPABILITIES
EN  WHAT WE BUILD.
    SIGNATURE WEBSITES — Positioning, art direction, design and engineering as one system.
    STRATEGIC REDESIGN — Reframe what exists. Rebuild only what earns its place.
    APPLIED AI SYSTEMS — Turn knowledge, requests and decisions into reliable workflows.
DE  WAS WIR BAUEN.
    SIGNATURE-WEBSITES — Positionierung, Art Direction, Design und Engineering als ein System.
    STRATEGISCHES REDESIGN — Neu denken, was existiert. Neu bauen, was es verdient.
    ANGEWANDTE AI-SYSTEME — Wissen, Anfragen und Entscheidungen werden zu verlässlichen Abläufen.

04 — LENOX
EN  AI-ACCELERATED. / HUMAN-DIRECTED.
    LENOX researches, structures, compares and tests.
    Volkan directs the work and approves what ships.
    [ BRIEF LENOX ]
DE  AI-BESCHLEUNIGT. / MENSCHLICH GEFÜHRT.
    LENOX recherchiert, strukturiert, vergleicht und testet.
    Volkan führt die Arbeit und gibt frei, was rausgeht.
    [ LENOX BRIEFEN ]

05 — CONTACT
EN  BUILD WHAT YOUR COMPANY / SHOULD BECOME NEXT.
    Tell us what must change.
    [ START A PROJECT ]
DE  BAUEN, WAS AUS IHREM / UNTERNEHMEN WERDEN SOLL.
    Sagen Sie uns, was sich ändern muss.
    [ PROJEKT STARTEN ]

FOOTER
    VOLKAN AI STUDIO · SWITZERLAND / SCHWEIZ
    CREATIVE DIRECTION & ENGINEERING — VOLKAN
```

German is written for rhythm, not word-for-word fidelity. It addresses the reader exactly
once (05, formal "Sie"); changing register is a one-line edit.

`BRIEF LENOX` is honest: it opens the project brief and hands it to mail. It does not
claim an autonomous agent. `AI-ACCELERATED` was chosen over `AI-OPERATED` for the same
reason — the studio is accelerated by AI, not run by it.

## The entry (decided 2026-07-25)

The first URL call opens on the **living field**: the MLS-MPM simulation is visible and
pointer-reactive from the first paint, with the hero copy above it. The entry adds only
a threshold plate with two doors:

```
[ PLAY WITH ME ]   →  wakes LENOX, then the reality choice: GRAVITY · SIGNAL · ATELIER
[ ENTER STUDIO ]   →  straight into SIGNAL, no ritual
DE: [ SPIEL MIT MIR ] · [ STUDIO BETRETEN ] · REALITÄT WÄHLEN
```

Phases: `gate → arrival → select → handoff → entered`. A returning session skips to
`entered`; reduced motion skips the ritual entirely. The journey stays `inert` until
entry, so the gate is the only reachable control.

## Design IDs

IDs are permanent and technical: `design-01`, `design-02`, `design-03`. They appear in
`?design=`, in `data-design` and in CSS class names. **Labels are free text** and may be
renamed at any time without touching a URL, a stylesheet or a stored session. Current
labels — `design-01` = GRAVITY (world film), `design-02` = SIGNAL (editorial),
`design-03` = ATELIER (colour field).

## Layer ownership

The public engine canvas contributes **particles and LENOX on transparency, nothing
else**. `lenoxBackdrop` — the opaque lacquer panel — is off for this host via
`lenoxBackdrop: false` and stays the default for legacy/lab callers, which still own the
whole picture. Each reality owns its own background and composition.

## What this contract does not decide

- **Visual quality.** None of the three designs is claimed to be at agency level. That is
  art direction, judged by Volkan on visible material, not asserted here.
