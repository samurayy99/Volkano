# REF — Post-Enter Image Apparition

## Decision

For VOLKANO post-enter, we are using the external `particles-playground` project as a **reference for image-driven particle target formation**, not as a direct implementation blueprint.

The new post-enter direction is:

**arrest -> image apparition -> short hold -> ash fall / fade -> quiet reveal**

This fully replaces the old narrow-rift mass-intake direction as the primary creative reference.

We are borrowing the **core mechanics**, not the original product structure, UI, or demo style.

---

## External reference

- Repo: `isladjan/particles-playground`
- Earlier demo variant: CodePen-style image/video particle scene
- Author: Sladjan Ilic
- License: MIT

Reference summary:

- Three.js particle system
- image/video-driven particle targets
- threshold-based visible point extraction
- deterministic target layout
- shallow pseudo-depth via shader displacement / noise
- interactive tail / hover motion
- multi-scene gallery structure

For VOLKANO, this reference is treated as a **mechanics source**, not a UX/style template.

---

## Why this reference matters

This reference matters because it solves a simpler and more controllable problem than the old VOLKANO post-enter attempts.

The old direction repeatedly failed because it tried to make the same chamber population perform too many roles at once:

- matter body
- visible intake stream
- spatial choreography
- final disappearance

That produced wall / carpet / cloud / pillar reads.

An image-driven target is more explicit:

- a point is either active or inactive
- a particle has a target destination
- silhouette is controllable
- timing is directable
- the terminal state is easier to author

This makes a premium apparition moment much more realistic than trying to force the full chamber population into a believable freeform volcano / monolith / slit-intake event.

---

## What we borrow

We borrow these principles from the reference:

1. **Threshold / mask-based target extraction**
   - derive active target points from a source image or mask

2. **Deterministic target-driven formation**
   - each active target point becomes a stable destination for one apparition particle

3. **Controlled pseudo-depth**
   - add shallow relief / depth variation via brightness, noise, or a secondary field

4. **Readable short lifecycle**
   - gather / resolve
   - settle
   - brief hold
   - crumble / fall / fade

5. **Silhouette-first design**
   - the image must read immediately before motion detail matters

---

## What we explicitly reject

We do **not** adopt:

- quote / gallery / slideshow behavior
- multi-scene texture carousel
- text-in-particles as a main effect
- tail / hover interaction as part of the core apparition effect
- direct copying of the reference UI/UX structure
- direct reuse of the full reference codebase as a subsystem
- forcing the main MLS-MPM chamber population to do all apparition work
- reviving the old post-enter slit-intake system
- decorative fake hero layers unrelated to the actual owner path

---

## VOLKANO interpretation

This effect is **not** a generic 2D particle image.

For VOLKANO it should become a:

**stylized volcanic apparition**

- dark
- controlled
- silhouette-led
- shallow depth relief
- short-lived
- premium / cinematic
- not playful
- not poster-flat
- not gallery-like

Preferred visual direction:

- volcanic silhouette or eruptive relief
- ember / ash / mineral palette
- restrained luminance
- short hold
- crumble / gravity drop / fade
- chamber clears
- back wall / rift can reappear afterwards

Important:
Do **not** start with a detailed photo.
Start with a high-contrast icon / silhouette / glyph / contour-based source.

---

## Source asset: mask PNG vs mood photo

“**Mask PNG**” is **not** a different file format from a normal PNG. It describes **what the pixels mean**, not the extension.

| Role | Meaning |
|------|--------|
| **Mask-style source** | Alpha (transparent = inactive) or a **high-contrast** silhouette / white-on-black glyph: **active** pixels are unambiguously “the hero shape”. The extractor mostly asks: “is this pixel on or off?” |
| **Mood photo** | Sky, ridge, valley floor, and clouds often sit in **similar luminance bands**. Threshold + luma logic must **infer** the volcano; risk of a wide “matte” or landscape read instead of a single icon. |

**Current v1 asset:** `public/images/post-enter/volkano-apparition-source-v1.png`

- It **can** be enough for shipping **if** in-browser review shows: silhouette reads **immediately**, hold is legible, and decay does not read as random cloud. The pipeline already supports tuned extraction (e.g. bright strokes, thresholds, auto-polarity) — **prefer validating this file first** before splitting assets.
- Add a **dedicated mask file** (e.g. `volkano-apparition-mask-v1.png`) **only when** art direction still fails after extraction tuning: same dimensions optional; **transparent outside / opaque inside the silhouette**, or a flat **contour** layer. Then extend `postEnterImageTargetField` with an **alpha-first** or explicit mask mode (small code change, big contract clarity).

Rule of thumb: **fix the input contract before inventing a fifth motion heuristic.**

---

## Core dramatic structure

The intended post-enter read is:

1. **Arrest**
   - old chamber behavior stops
   - tension rises

2. **Resolve**
   - a controlled apparition forms from the particle field

3. **Hold**
   - the shape reads clearly for a short, deliberate moment

4. **Ash**
   - the apparition breaks, falls, and loses coherence

5. **Quiet**
   - the chamber clears and the architecture remains

This must feel like:
**matter -> sign -> decay -> silence**

Not:
**gallery image -> pretty particle trick**

---

## Target architecture in our repo

### Owners

#### `PostEnterDirector`

Owns timing / phase progression only.

Target phases:

- `arrest`
- `resolve`
- `hold`
- `ash`
- `quiet`
- `rotation_ready`

No old `extract/capture/clear corridor` semantics.

#### `mlsMpmSimulator`

Owns:

- pre-enter source / play / convergence / freeze only

After enter:

- simulator yields motion ownership via lock / freeze handoff
- no new post-enter choreography should be rebuilt inside the simulator

#### `particleRenderer`

Owns:

- body read for the main chamber population
- post-enter depletion / disappearance of that body population

It must **not** become the choreographer of the apparition.

#### `postEnterImageTargetField`

New module.
Owns:

- source image loading
- thresholding / mask extraction
- target sampling
- target position generation
- optional depth / relief field generation

#### `PostEnterApparitionLayer`

New module.
Owns:

- image-driven apparition particles
- resolve motion
- hold
- ash fall / crumble
- fade / death

---

## Important owner rule

The main chamber population is **not** the only hero actor anymore.

### Main chamber population

Role:

- body
- pressure
- depletion
- atmospheric release of mass

### Apparition layer

Role:

- controlled hero event
- clear silhouette
- short-lived symbolic moment

This split is intentional and required.

---

## Constraints

- preserve pre-enter play state
- do not resurrect old `postEnterFlightSystem` logic
- do not rebuild old rift/capture/spine/corridor semantics
- do not solve the effect with CSS/UI tricks
- do not build a general-purpose particle gallery
- do not optimize for “all particles remain equally visible”
- do not let the renderer own choreography that belongs in the new apparition system
- optimize for legibility, hierarchy, control, and designed decay

---

## Non-goals

This work is **not** trying to:

- rebuild the external repo inside VOLKANO
- create a reusable gallery/slideshow engine
- support many images/videos/scenes in v1
- use one particle population for all narrative roles
- preserve the old post-enter slit-intake thesis
- imitate the reference style literally

---

## First implementation milestone

1. choose one single source image / mask
2. preprocess it into sampled target points
3. build a minimal `postEnterImageTargetField`
4. build a minimal `PostEnterApparitionLayer`
5. keep `particleRenderer` limited to main body depletion during post-enter
6. do not reintroduce old rift-flight complexity in this milestone

---

## Success criteria

The new post-enter succeeds if:

- the silhouette reads immediately
- the apparition feels spatial, not poster-flat
- the hold is short and deliberate
- the decay reads as ash / crumble / controlled fall, not cloud noise
- the chamber clears cleanly afterwards
- the result feels like a designed VOLKANO moment, not a borrowed demo
- no old wall / cloud / pillar / carpet behavior returns
- pre-enter remains intact

---

## How we proceed (recommended order)

1. **Validate in the running build**  
   Run the full post-enter strip (`arrest` → `rotation_ready`) once with the current asset and stack (target field, `PostEnterApparitionLayer`, MLS body fade, relaxed body `depthWrite` during post-enter). Judge only against [Success criteria](#success-criteria) above — not against the gallery feel of `particles-playground`.

2. **If the silhouette and hold already read**  
   Treat `volkano-apparition-source-v1.png` as the locked v1 source. Document the chosen `buildPostEnterImageTargetField` options (threshold, bright/dark, URL) in commit messages or a short code comment near the call site so regressions are obvious.

3. **If the shape is still diffuse or “landscape-matte”**  
   Do **not** add another layer of unrelated motion. Instead:  
   - art: deliver a **mask-style** PNG (alpha or binary silhouette) as above;  
   - code: add an **alpha-first / mask** path in `postEnterImageTargetField` and point the URL at the new file.  
   Keep director timings stable until the target field is trustworthy.

4. **Polish after the signal is right**  
   Only then tune apparition quad size, palette, ash drift, or phase lengths — otherwise tuning fights the wrong problem.

5. **For collaborators (Claude / Codex / humans)**  
   When someone says “mask PNG”, point them to [Source asset: mask PNG vs mood photo](#source-asset-mask-png-vs-mood-photo) so they do not confuse “new format” with “clearer pixel contract”.

---

## Practical reading rule for future sessions

When using this reference in future Claude/Codex sessions:

- treat the external project as a **mechanics reference**
- do not treat it as a drop-in architecture
- do not copy UI, scene switching, or interaction systems
- only extract the image-target formation logic and short-lived apparition behavior

---

## Reference sources

- Repo: `https://github.com/isladjan/particles-playground`
- Earlier inspiration: CodePen-style image/video particle scene by Sladjan Ilic

The value of the reference is:

- image threshold extraction
- sampled target positions
- pseudo-depth relief
- deterministic resolve / hold / decay

Not:

- gallery product logic
- quote UX
- interaction gimmicks
- full scene system
