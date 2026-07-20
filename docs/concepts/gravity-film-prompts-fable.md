# GRAVITY Film — Fable's Generation Prompts (English, final concept)

Concept: THE INVERTED TIDE × THE SILENT LOOM (see `gravity-film-contract.md`).
Critical rule all other prompt sets missed: **the robot is NEVER in the film.** LENOX is rendered live by the engine in front of it. The world reacts to an unseen presence.

## MASTER STYLE BLOCK — prepend to every prompt

```
One single continuous cinematic shot. An impossible dark world made of ONE
substance only: an obsidian-black ocean that behaves between liquid metal,
black glass and heavy monumental membrane. Deep blacks, restrained graphite
reflections, cold liquid-silver edges, and sparse cyan light (#35E7FF) that
lives INSIDE the material as thin veins and slow pulses — never as neon glow,
never as fog. No amber, no warm colors anywhere.

Camera: perfectly stabilized, locked horizon, one imperceptibly slow constant
forward drift. No cuts, no shake, no zoom bursts, no rack focus.

Motion: extremely slow, heavy, coherent. Only large connected surfaces deform —
stretching, folding, curving, smoothing. No splashes, no detached droplets,
no small flickering details, no turbulence. Every movement must remain elegant
and physically believable when the footage is played BACKWARDS or paused at
any frame (this footage will be scroll-scrubbed in both directions).

Composition: dark-leaning, premium, editorial. Always preserve one large calm
near-black negative-space zone for white typography.

Strictly absent: any robot, figure, character, face, creature, text, logo,
watermark, UI, stars, clouds, smoke, dust, fire, stone, ceramic, plants,
recognizable sci-fi hardware.

Photorealistic material rendering, large-format cinema optics, high dynamic
range, filmic grain.
```

## PART 1 — THE STILL BASIN (site section: EXPERIENCE)

**Desktop 16:9**
```
A vast obsidian-black liquid plane fills the lower half of the frame, dense
and still like black glass, stretching into darkness. The horizon curves
subtly UPWARD at the far edges, revealing that this is the inside of an
enormous engineered instrument, not open nature. Beneath the surface: a few
hair-thin liquid-silver capillaries drift very slowly, and two or three faint
cyan pulses travel along them like distant thoughts. Broad, soft, slow
caustic light breathes across the dark surface. Directly above one point of
the surface, delicate concentric silver tension rings appear and relax, as if
the liquid is quietly aware of an unseen presence floating there. The left
third of the frame carries the surface detail; the center-right stays almost
pure black and calm for typography.
```
**Mobile 9:16 (restage, not crop):** the liquid horizon sits in the lower quarter; immense dark vertical depth above it; the silver tension rings sit in the upper third (beneath the live LENOX position); an uninterrupted dark column runs through the center for text.

## PART 2 — THE DRAW (site section: SYSTEMS)

**Desktop 16:9**
```
The black liquid surface begins to answer an invisible gravitational field:
three or four broad, widely separated sheets of the ocean stretch upward in
extreme slow motion, like heavy black satin being lifted from below the
world. The sheets stay connected to the surface at all times — nothing tears,
nothing drips. Along their curved spines, thin liquid-silver ribs emerge,
forming tall elegant arcs like monumental tuning forks. Cyan veins climb
slowly through the ribs, making the internal forces visible. The rising
architecture occupies the left and lower frame; the upper right remains a
deep calm black field for typography.
```
**Mobile 9:16:** the sheets rise along BOTH side edges of the tall frame like a slowly forming canyon of black satin; the central vertical column stays calm and dark; silver ribs arc inward high above.

## PART 3 — THE INVERSION (site section: WORK / CASES) — HERO

**Desktop 16:9**
```
The entire black ocean has risen and now hangs INVERTED above the viewer as
one continuous suspended liquid ceiling — a whole sea held upside down by
invisible force, its surface tension rippling in slow concentric waves. In
this overhead ocean, a precise circular aperture stands open, offset toward
the upper left: its rim is a razor-thin band of liquid silver, its inner edge
carries one restrained cyan line, and beyond it lies pure black depth.
Beneath the inverted sea, a few enormous sparse silver ribs curve through
the dark space like the bones of a cathedral. The lower right half of the
frame stays near-black and calm for typography. The scene feels impossibly
controlled: a world obeying something calm and unseen at its center.
```
**Mobile 9:16:** the inverted ocean becomes a high dark canopy filling the top quarter, aperture near the top edge; silver ribs descend along the sides; the central and lower frame stay calm and dark. It must feel like standing beneath a vertical sea.

## PART 4 — THE LISTENING ARCHITECTURE (site section: VOLKAN)

**Desktop 16:9**
```
The suspended ocean has softened into architecture: two vast black membrane
wings unfold to the far left and right, and between them hangs a deep passage
of large floating black lamellae — long horizontal slats of black glass, each
tilted at a minutely different angle, like a field of precise instruments
quietly listening. Cyan light has become calmer: one single thin line travels
slowly along the lamellae edges. Silver appears only as fine rims where light
grazes the slats. The visual weight lives at the frame edges; the center is
the darkest, calmest, emptiest zone of the entire film, reserved for a quiet
human moment in the content layer.
```
**Mobile 9:16:** the lamellae stack vertically up both edges like a tall resonant instrument; the wings become ceiling and floor shadows; the wide central column stays untouched black.

## PART 5 — THE ANSWER SURFACE (site section: CONTACT)

**Desktop 16:9**
```
All architecture has settled back into one great membrane, now standing
almost vertical in space: a frameless black mirror, faintly liquid, breathing
by less than a percent. From the deep darkness below, one single cyan line
rises slowly toward the mirror surface. Where it arrives, it draws a precise
circle of liquid silver onto the black — but the circle remains deliberately
INCOMPLETE, a thin open arc, waiting. The center of the circle is perfect
matte black, reserved for the final call to action. Nothing else moves except
the mirror's slow breath and a faint silver reflection drifting across it.
The world is not ending the journey; it is waiting for an answer.
```
**Mobile 9:16:** the black mirror fills the full tall frame; the incomplete silver-cyan circle sits in the lower half around the CTA zone; the cyan line rises from the bottom edge.

## GENERATION SETTINGS

- 2–3 seeds per part; pick by eye. 8–10 s per clip, slowest available motion setting.
- Highest available resolution; upscale to ≥1600×900 (Topaz) before frame export.
- For continuity between parts: condition each part's generation on the final frame of the previous part (image-to-video / first-frame input) so substance, lighting and camera logic persist.
- Export later: `ffmpeg -vf "scale=1600:900,fps=24" -quality 82 frames/f_%03d.webp` (Fable does this step).
- Proof-clip order: Part 1 and Part 3 first, desktop + mobile, before producing all five.
