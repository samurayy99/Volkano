# VOLKANO — Compact Creative + Engineering Brief

## What This Is

VOLKANO is a personal website that must work at the same time as:

- a world-class proof of web engineering
- a premium business offer
- an authored spatial browser experience

It must not feel like a demo, a toy slider, a portfolio cliché, or a design experiment without purpose.

**Leitprinzip**

> The volcano is the source.  
> The sentence is the proof.  
> The interface is what remains.

---

## Strategic Truth

We already proved one important thing:

- the live particle system is the strongest asset in the project

We also proved what does **not** work:

- particles morphing letter-by-letter into typography (too fragile, weak staging)
- particles becoming logo
- overbuilt sequence engines
- fragile transform theater
- mathematically correct motion with weak staging
- endless scalar tuning without structural change

The current direction is locked:

- **particles are living matter that converges, freezes, and hands off to DOM**
- **DOM owns proof text, brand, and UI**
- **CSS owns chamber motion**
- **the chamber is the carrier**
- **scene dominance matters more than geometric purity**
- **thermal ramp is LOCKED — do not reopen color tuning**

If something is technically correct but emotionally weak, it is wrong.

---

## Experience Model

This is a staged chamber experience with a strict dominance sequence:

1. **Source-dominant**
2. **Proof-dominant**
3. **Hero-wall-dominant**
4. **Interface-dominant**

That order is non-negotiable.

### Meaning of each stage

**Source**
Live, pressurized matter inside a shared chamber. Thermal ramp locked (coal → deepRed → ember → flareRed → fireGold → hotWhite). Temporal heat memory with source-proximity accumulation.

**Convergence** (transition from Source to Proof)
Internal progress 0–100. Particles gradually slow, organize, and freeze. At 100: particles are still, DOM text “I BUILD SUPA STUFF” appears over/through the frozen mass. This is NOT particles forming letters — particles freeze as a mass, DOM text takes over.

**Proof**
“I BUILD SUPA STUFF” as a full readable verdict. DOM-owned. Visible on the front face together with frozen particles.

**180° rotation** → reveals Hero/Interface on the back face

**Hero wall**
The volcano world revealed as a cinematic destination.

**Interface**
The business surface that remains after the reveal.

Note: Legacy convergence code (2×90° rotation, old sequence engine) exists in the codebase. It must be replaced, not extended.

---

## Current Highest Priority

### Convergence Pipeline

The source stage is solved — thermal ramp locked, particle look finalized, pushed to GitHub.

The next bottleneck is the **convergence pipeline**: the transition from living source to frozen proof.

**Pipeline spec:**
- Internal progress value 0–100 (driven by Enter button or scroll or timer — TBD)
- 0–70: particles gradually slow down, turbulence reduces, mass compresses
- 70–95: particles organize into a denser, calmer formation
- 95–100: particles freeze to stillness
- At 100: DOM text "I BUILD SUPA STUFF" fades in over/through the frozen mass
- After convergence: proof text appears on front face over frozen particles
- After proof moment: 180° chamber rotation reveals hero wall on back face

**Constraints:**
- Particles do NOT form letter shapes — they freeze as a natural mass
- The slowdown must feel like cooling lava, not a pause button
- The proof text must feel like it was always there, revealed by stillness
- The freeze must be reversible if the user hasn't triggered rotation yet
- Do not touch the thermal ramp — color is locked

---

## Ownership Rules

| Concern              | Owner                  |
| -------------------- | ---------------------- |
| live matter + freeze | WebGPU particle engine |
| convergence progress | engine bridge / JS     |
| proof text           | DOM/CSS                |
| brand text           | DOM/CSS                |
| UI                   | DOM/CSS                |
| chamber motion       | CSS 3D transforms      |
| hero wall image      | DOM/CSS                |
| stage dominance      | layout + motion logic  |

### Hard rule

Do not ask the particle system to do DOM’s job.  
Do not ask DOM to fake the particle system.  
Do not ask CSS motion to solve weak staging by itself.

Each layer must own the thing it is best at.

---

## The Chamber

The chamber is not a toy cube and not a literal CodePen clone.

It is a **dark spatial carrier** that supports the four dominance states.

### Chamber goals

- give the source scale
- provide negative space
- create depth around the event
- make the hero wall feel latent before reveal
- support a heavy spatial transition

### Chamber art direction

- dark graphite / basalt / mineral surfaces
- precise architectural planes
- subtle seam light or edge light
- no pale gallery feeling
- no featureless black void
- no glossy sci-fi
- no glassmorphism

The chamber should feel:

- engineered by humans
- stained by geology
- quiet, expensive, intimidating

---

## Source Stage

The source is the hook.

It must feel like:

- heated matter
- pressure
- viscosity
- contained danger
- a living mass, not random particles

### Desired source behavior

- dense pressure core
- unstable outer shell
- plume-like peel-off and reabsorption
- slight lift / drift / wake
- no dead static hovering
- no chaotic unreadable storm unless explicitly justified

### Desired source composition

- large, but not fullscreen wallpaper
- slightly off-center
- framed by chamber void
- clear air to back wall
- readable front / middle / rear depth layers

### Source palette (LOCKED)

6-stop volcanic thermal ramp: coal → deepRed → ember → flareRed → fireGold → hotWhite.
Temporal heat memory with source-proximity accumulation. Do not modify.

---

## Proof Stage

The proof is:

# I BUILD SUPA STUFF

This is not decorative copy.  
This is not a label.  
This is not a subtitle block.

It is the verdict.

### Proof rules

- must be fully legible
- must feel stage-sized
- must take over perception
- must not read as a narrow strip
- must not feel like a random overlay hack
- must not be diluted by extra explanation text

If the user has to hunt for it, it fails.

---

## Hero Wall Stage

The back wall must first land as a **hero scene**, not as a complete content wall.

The volcano image is not filler. It is the scenic reveal.

### Hero landing must prioritize

- VOLKANO
- Book a Call
- atmospheric negative space
- clean composition over the volcano wall

Not:

- dense cards everywhere
- full section stack immediately
- generic agency landing layout
- content overload on arrival

The user should feel:

> this world was there the whole time

---

## Interface Stage

Only after the hero landing should the interface become more active.

The interface must feel:

- premium
- restrained
- useful
- sharp
- inevitable

Not:

- SaaS template
- dashboard cliché
- trend soup
- over-decorated premium mockup

Initial content priority after landing:

1. brand
2. CTA
3. hero composition
4. then services / evidence / contact

---

## Motion Rules

### 1. One authored spatial event

The chamber transition must feel like one heavy spatial mechanism aligning into the next state.

Not:

- fiddly sequence soup
- arbitrary timer theater
- random fades pretending to be motion

### 2. Stage dominance beats mathematical purity

A mathematically correct rotateY is not enough.

If the active stage does not take over perception, the implementation is wrong.

### 3. Proof must become readable as a true moment

Whether achieved through geometry, staging, timing, or composition, the user must experience the proof as a real moment of authority.

### 4. Hero must land before interface density

The first arrival is cinematic.  
The interface comes after.

---

## Particle Engine Policy

The particle engine owns source + convergence + freeze.

### Locked (do not touch)

- thermal ramp (color stops, accumulation rates, decay)
- velocity-stretch
- particle geometry (rounded box)
- MLS-MPM simulation core

### Allowed

- convergence pipeline: slowdown, compression, freeze driven by progress 0–100
- reading progress uniform to modulate simulation speed / turbulence / gravity
- minimal hooks to signal freeze-complete to DOM layer

### Not allowed

- particles forming letter shapes or logos
- field switching between different attractor targets
- giant transform state machines
- hidden second choreography systems
- reopening thermal ramp tuning

### Important

The primary convergence read should remain a controlled cooldown, not fake choreography.
Particles should slow and compress under physics through the strongest part of the event.
If the late-stage aftermath becomes visually weak or structurally stuck, a narrow hybrid handoff is allowed to clear the chamber and support proof dominance.

---

## Visual Standard

Everything must feel:

- authored
- expensive
- restrained
- slightly intimidating
- unlike a normal portfolio

If it feels like:

- a tech demo
- a student experiment
- a CodePen remix
- an agency template
- a motion gimmick

it is wrong.

---

## Performance

Performance is part of the aesthetic.

- Desktop must feel premium and responsive
- Mobile must feel intentional, not degraded trash
- prefers-reduced-motion must get a clean alternative

Never destroy the source stage for a flashy transition.

If a transition idea harms the opening quality, reject the transition idea.

---

## Definition of Success

### Non-technical visitor

They think:

- “I have not seen this before.”
- “This feels serious.”
- “Whoever built this is on another level.”

### Premium client

They think:

- “I want this kind of care on my website.”
- “This feels custom and expensive.”
- “This person clearly builds high-end work.”

### Senior engineer / designer

They notice:

- clear ownership boundaries
- strong spatial staging
- real GPU work where GPU work belongs
- DOM/UI where DOM belongs
- restraint
- no fake complexity

---

## Non-Negotiable Rules

1. **Particles are matter** — they must not be asked to form typography, logos, or decorative symbolic shapes.
   They may, however, hand off to a controlled late-stage clearing / staging layer if that preserves stronger scene dominance and a cleaner proof moment.
2. **DOM owns proof, brand, and interface**
3. **CSS owns chamber motion**
4. **Active stage must take over perception**
5. **Proof must be fully legible**
6. **Hero lands before interface density**
7. **No overengineering**
8. **Trust what renders, not what theory promises**

---

## Working Method

When implementing:

1. ~~solve the source stage first~~ DONE — locked
2. build convergence pipeline (slowdown → freeze → text reveal)
3. verify proof is truly readable after freeze
4. build chamber rotation (180° reveal)
5. verify hero landing feels cinematic
6. then layer interface density carefully

When judging quality:

- trust the browser
- trust the render
- trust scene dominance
- do not hide behind technical correctness

---

## Final Standard

This is correct if the experience feels like:

- the source was alive
- the matter cooled and settled
- the proof landed with authority
- the world behind it was revealed
- the interface remained as the disciplined consequence

This is wrong if it feels like:

- a slider
- a portfolio gimmick
- a toy cube
- a black box with particles
- a demo with impressive parts but no authored whole
