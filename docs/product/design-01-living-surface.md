# DESIGN 01 — THE LIVING SURFACE

**Decided:** 2026-07-25, team round (Volkan · Fable · ChatGPT · Grok-for-Codex · Gemini).
**Scope:** the visual and behavioural direction of design 01 only. Designs 02 and 03
are different disciplines, not different colours — see §11.

## HOW TO READ THIS DOCUMENT

Two kinds of statement, never mixed:

> **CONTRACT** — decided. Do not reopen without Volkan.
> **DIRECTION** — the intent. Judged on visible material and expected to change.

Nothing here is a specification for something that has been seen working. P1 failed
its visual gate; P2 was never built. §10 lists exactly what is unproven, and that
list is the honest state of this project.

---

## 1. THE THESIS

> **CONTRACT**
>
> The background is not a place. It is one living material.
> LENOX is not a character. It is the intelligent state of that same material.
> The customer's system is its ordered state.

No octopus, no robot, no face, no eyes, no mascot in front of a backdrop. The visitor
recognises LENOX by **behaviour**, never by anatomy.

Why the earlier directions failed: graphite/cyan was rejected for being *cold*; the
pastel reef was rejected for being *weak*. Both lacked the same thing — **weight**.
The axis was never light/dark, it was light/heavy.

---

## 2. THE PHASE MODEL — the spine

> **CONTRACT**

One material passes through states as the visitor scrolls. This is the narrative and
the technical order at once.

```
GAS        ambient, spatially distributed, slow irregular drift, no visible loop
FLUID      pointer displacement, deformation, short memory, return to rest
CONDENSATE local density rises, motion becomes directed, optical connection appears
CRYSTAL    clusters, routes, priorities, handoffs — named structure
CALM       complexity drops, residual matter, the page settles
```

**Chapters versus beats — resolved 2026-07-25.** There are **six semantic chapters**
and they are the only things that carry copy, URLs, navigation and state. *Arrival*
and *opening* are **motion beats inside `hero`**, not chapters: they have no words of
their own. Anything else is two competing information architectures and ends in
scroll and state chaos.

| # | Chapter (semantic) | Beats inside it | Phase |
|---|---|---|---|
| 01 | `hero` | arrival · opening | GAS → FLUID → open space |
| 02 | `principle` | — | one core → three realities |
| 03 | `capabilities` | three scenes | image-led, matter as connective tissue |
| 04 | `lenox` | — | → CONDENSATE, attention without a face |
| 05 | `diagnosis` | intake · qualification · routing · handoff | → CRYSTAL |
| 06 | `contact` | — | → CALM |

Shipped today: five chapters (`hero`, `principle`, `capabilities`, `lenox`, `contact`).
**`diagnosis` is the one addition still to build** — the customer moment, and the only
part of the page that actually sells.

---

## 3. ENGINE LAW

> **CONTRACT**

```
ONE SOLVER
ONE PARTICLE POPULATION
ONE MATERIAL LANGUAGE
MULTIPLE FORCE AND TARGET STATES
```

The existing MLS-MPM simulation and its ray-based pointer path are **preserved**.
The field-only runtime on `origin/codex/living-agency-v1` is **rejected** and must not
be reintroduced.

The three behaviours are target assignments over that one solver — but targets alone
are not the material. Ambient matter also needs flow, density, light and pointer force.

```
Field      target = own origin        passive, returns
LENOX      target = assigned form     active, moves with intent
Typography target = glyph form        appears, disperses
```

**Layer ownership** (Gemini): DOM owns copy, navigation, language and accessibility
and always sits above the renderer. The engine owns matter and light. Neither
reaches into the other.

---

## 4. THE FIVE CORE MECHANICS

> **DIRECTION** — each needs a browser proof before it becomes contract.

**K1 · Precomputed target-map pipeline**
Any texture — a glyph, a silhouette, a diagram — becomes a set of particle targets.
Maps are built **ahead of time** and stored as compact GPU data or derived from SDFs
and vector masks. Never extracted on the main thread during scroll.
*Source: R2#1 (method), corrected by ChatGPT (naming and pipeline).*

**K2 · Target + force stack**
Per particle: position, target, velocity, spring, friction. Above that: rest field,
pointer displacement, ambient flow, LENOX attractor. Changing organisation is how
meaning appears — never by swapping the particle system.
*Source: R2#2 + R2#6.*

**K3 · Pointer as a decaying force texture**
A small canvas records pointer position with **velocity**, ages each point, and feeds
the simulation as an additional force. Fast motion tears, slow motion pushes.
*Source: R2#1.*

**K4 · Material weight**
Fresnel + refraction (IOR ≈ 1.42–1.45) + Beer-Lambert absorption. Light travels
*through* dense matter and is coloured by the distance it travels. This is the
difference between dust and substance.
*Source: R1#9, jelly ZIP. **Ideas ported, code not** — both ZIPs are TypeGPU on
Three 0.181; we run TSL on 0.175. A second shader toolkit is a second renderer.*

**K4b · The environment map is half of K4**
Refraction needs something to refract; what the matter reflects decides whether it
reads as expensive. Two candidates, A/B'd in Proof A: the procedural black studio in
`voidEnvironment.js` (zero bytes) against a Poly Haven studio HDRI (CC0, commercial
use, no attribution). **1K, prefiltered to a small cubemap** — reflections do not need
resolution, and a large file would cost the one advantage a computed hero has.
The meadow HDRI still loaded today (`autumn_field_puresky_1k.hdr`) is a leftover from
the fluid demo and is the documented reason the silver never read as material.
Surface textures — wood, brick, fabric — have no use here: we have no surfaces.

**K5 · Temporal budget**
TAA against fewer raymarch steps. Density passes at reduced resolution.
*Source: jelly ZIP.*

---

## 5. WHAT GOES WHERE

> **DIRECTION**

| Chapter | Mechanic | Reference |
|---|---|---|
| hero | rest field + origin return; self-motion when nobody touches | R2#6, R1#9 |
| hero | pointer force texture | R2#1 (K3) |
| hero | volumetric density as depth — **as atmosphere, never as visible clouds** | clouds ZIP |
| hero | distinct beats: hold → open → transfer → settle → copy | R2#3 |
| hero | the field itself opens; **no scale-down, no picture-in-picture** | P1 failure |
| principle | same words rebuilt in another material | R1#7 |
| principle | surface fragments into the next reality — rebuilt with particles, not 350 SVG nodes | R1#8 |
| principle | typographic state selector for the three designs | R1#2 |
| capabilities | elements assemble, one takes ownership and expands | R1#4 |
| lenox | radial attention signature — focus, not pupils | R1#1 |
| lenox | condensate: density → optical connection | R1#9, K4 |
| diagnosis | target maps: enquiry → qualification → routing → handoff | R2#1, K1 |
| diagnosis | compact selection expands into a system surface | R2#3 |
| contact | matter loses complexity, one brief expansion remains | — |

---

## 6. BUILD ORDER

> **CONTRACT** — nothing later starts before the earlier gate passes.

```
A  PHASE FIELD          /proto/phase-field
   same particles, three visibly different behaviours: AMBIENT · ATTENTION · LENOX.
   plus the material question: what is the substance, in a few temperatures.
   must prove: no mascot, stable pointer interaction, matter not dust.

B  CONDENSATE
   density rises → optical connection → attentive form → clean release.
   no face, no mascot, no generic blob.

C  OPENING
   the validated material opens into the first story scene.
   no scale-down, no picture-in-picture, boundary crossing with real occlusion,
   distinct beats, copy last.

D  TARGET MAPS          K1 pipeline, first real use in the diagnosis chapter.

E  JOURNEY              chapters wired to the phase model.
```

**The opening comes after the material, not before it.** An earlier draft of this
document had it first — that was the retired sequence carried forward. You cannot
choreograph the opening of a substance you have not defined. `/proto/opening` is a
visually rejected legacy engineering proof: keep it as evidence, do not extend it.

Every gate is judged **on video by Volkan**. Not on a report, not on stills — stills
lie about motion, which is exactly how P1's incoherent wake sequence was missed.

---

## 7. PERFORMANCE LAW

> **CONTRACT**

Four expensive systems are on the table: MPM simulation, volumetric density,
refraction, particle typography. **All four together do not run on a phone.**

- Passes are added **one at a time**, each with a measured cost on a real device.
- A six-pass pipeline is **not** a target state. It is a menu.
- Particle counts are **adaptive tiers determined by visual testing** — low / medium /
  high. No fixed number is written into this document; earlier claims that "1500 is
  enough" were derived from a CodePen with different rendering and are withdrawn.
- Trails use a **bounded decay texture** with defined lifetime and maximum intensity.
  Never an uncleared canvas — that is uncontrolled smearing, not memory.

---

## 8. ACCESS

> **CONTRACT**

No interaction may block access. The whole journey works with ordinary scrolling;
pointer and touch are a bonus, never a condition.

Reduced motion and devices without WebGPU get the **same content and the same
chapters**, including a complete path to the customer moment. The fallback is
static or lightly animated DOM typography and CSS mask reveals — **not** a lesser
effect resurrected for the purpose.

Mobile is its own composition with its own portrait assets, never a cropped
landscape.

---

## 9. REJECTED FOR GOOD

```
octopus, robot, any face or mascot        strobing / repeated black-white flashing
fantasy landscape, coral reef, pastel     wheel hijacking, forced interaction
generic black monolith                    chat window in the corner
field-only runtime as physics             second renderer / second shader toolkit
rainbow or confetti particles             permanent logo built from particles
picture-in-picture as a "reveal"          effect-per-section thinking
copied CodePen dependencies               CPU image extraction during the experience
```

---

## 10. UNPROVEN

> Read this before writing any of the above into code.

1. **Particles holding a readable form while breathing.** Not one of the 17 studied
   references shows it. They hold still, or they drift. LENOX lives exactly in
   between. This is P2 and it is the project's central risk.
2. **Particles coupled to scroll rather than pointer.** No reference does it, and this
   is a scroll experience.
3. **Reduced motion and non-WebGPU paths** for this direction.
4. **Material quality without imagery.** With no photography behind it, everything
   rests on the rendering. If the substance looks cheap, nothing rescues it.

---

## 11. CONSEQUENCES FOR OTHER DOCUMENTS

**`gravity-reef-scroll-score.md` and `gravity-creative-contract.md` are superseded as
the visual direction.** Both describe the Gravity Reef — a sunlit coral canyon with a
five-beat film score — and are still marked LOCKED. That world is retired by this
decision. The *production discipline* in them (one master still, image-to-image
consistency, no camera reversal in transitions) stays valid if film is ever used again.

**`studio-content-contract.md` stands unchanged.** The words do not depend on the
material. Design 01 must render exactly the same five chapters as 02 and 03.

**Designs 02 and 03 are different disciplines, not different temperatures.** Three
particle worlds in three colours would prove one trick three times. 02 is editorial —
typography, grid, restraint, no engine layer. 03 is open. Design 01 may run dark;
02 and 03 carry the bright register, which is what makes the earlier veto compatible
with this decision.
