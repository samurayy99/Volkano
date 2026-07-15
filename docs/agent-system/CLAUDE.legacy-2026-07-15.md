# CLAUDE.md

Project-level instructions for the VOLKAN AI STUDIO / LENOX repository.

## Project

VOLKAN AI STUDIO is a high-end demonstration of interactive AI and real-time web engineering.

The website is not merely about AI. The website itself is the AI demonstration.

The experience should create curiosity, emotional impact, and technical credibility before pushing visitors into a sales funnel.

Visual ambition matters, but it must remain coherent, performant, and technically credible.

## Core Principle

LENOX is the living AI interface of the website.

Protect the feeling that LENOX is a spatial, intelligent, non-human entity that can perceive, reason, create, and act.

3D, particles, shaders, motion, and scroll-cinematic moments are welcome only when they strengthen this identity and the visitor experience.

Do not add complexity merely to make the implementation appear advanced.

## LENOX Canon

LENOX is "The Sentient Sigil":

* compact floating abstract head or sigil
* tapered obsidian silhouette
* two deep optical eyes
* liquid-silver eyelid rims
* multilayered dark irides
* restrained cyan glint
* central negative V-shaped cut
* optional fine mouth seam
* two rear lamellae

LENOX is not:

* a human or digital twin
* a fake employee
* a chatbot bubble
* a cartoon mascot
* a conventional robot
* a humanoid body
* a crypto assistant

Do not add human skin, ears, a conventional nose, robot armour, cartoon pupils, floating eyebrows, or generic sci-fi decoration.

Canonical expression states include:

* Neutral
* Curious
* Pleased
* Concerned
* Listening
* Thinking
* Speaking
* Acting

## Visual Direction

The approved visual world uses:

* fullscreen black or graphite space
* silver, white, and cyan as the primary AI signal
* restrained off-white typography
* amber only for urgency, ignition, priority, or exceptional emphasis
* controlled negative space
* cinematic depth
* physically convincing motion and materials

Avoid:

* generic SaaS layouts
* ordinary card grids
* chatbot interfaces
* random purple-blue gradients
* generic particle demos
* unnecessary UI chrome
* lava or rock-wall aesthetics
* cartoon robots
* visual effects without narrative purpose

The existing responsive stage, desktop composition, controls, and interaction behavior are the approved baseline.

Do not redesign approved areas unless the user explicitly reopens them.

The removed material-study direction must not be revived.

## Established Entry Journey

The current entry journey is:

1. `PLAY WITH ME`
2. pointer or touch affects the particles
3. `WAKE LENOX`
4. the visitor performs the wake interaction
5. particles form the LENOX entity
6. LENOX responds through gaze and behavior

Do not introduce sales-intake questions before the visitor has experienced LENOX unless explicitly requested.

Do not replace the live WebGPU experience with pre-rendered video or a generic scroll-video system unless approved as a separate experiment.

## Technical Source of Truth

Current core stack:

* Next.js
* React 19
* TypeScript
* Tailwind CSS 4
* Three.js `0.175.0`
* `three/webgpu`
* `three/tsl`
* GPU compute and particle simulation

The repository code and installed dependency versions are the source of truth.

The project-local `webgpu-threejs-tsl` skill is reference material and may include guidance for newer Three.js releases.

Before using an API from the skill:

1. inspect the installed Three.js version
2. inspect the existing project implementation
3. verify the API against the installed package
4. preserve the current architecture unless a migration is explicitly approved

Do not introduce r183-only APIs into the current Three.js `0.175.0` codebase.

Do not replace existing `THREE.PostProcessing` behavior with newer pipeline APIs unless the Three.js version is deliberately upgraded.

## Architecture Ownership

`src/flow-engine/` owns:

* the WebGPU chamber
* rendering systems
* simulation
* GPU compute
* particles
* the engine bridge

React application and stage modules own:

* UI composition
* interface state
* responsive presentation
* the handoff between interface and engine

Respect these boundaries.

Do not create:

* a second renderer
* a second animation-loop owner
* duplicate state ownership
* parallel versions of an existing system
* hidden synchronization between React and the render loop
* a new framework inside the existing framework

Fix problems in the module that owns the behavior.

## Repo Boundaries

Read before editing. Diagnose before changing code.

The working tree may already contain uncommitted user work.

Before editing:

* inspect `git status`
* inspect relevant diffs
* identify pre-existing changes
* preserve unrelated modifications

Keep diffs narrow. Every changed line should trace directly to the task.

Do not:

* reset, revert, discard, or overwrite user changes
* refactor adjacent working systems
* rename unrelated files or symbols
* reformat unrelated code
* remove unrelated dead code
* add speculative features
* introduce unnecessary abstractions
* add dependencies when the existing stack can solve the task

Do not change without explicit approval:

* dependency versions
* `package.json` or lockfiles
* deployment configuration
* GitHub or Vercel configuration
* Claude plugins, MCPs, hooks, skills, or permissions
* the WebGPU chamber core architecture

Never use destructive Git commands.

## Working Style

After a clear instruction, act without repeatedly asking for confirmation.

For non-trivial work:

1. inspect the relevant files
2. identify the owning system
3. state a brief plan
4. make the smallest complete change
5. run the relevant checks
6. verify the result in the actual application

Resolve uncertainty from the repository first.

Ask only when progress requires:

* a genuine product or art-direction decision
* permission for a destructive or external action
* missing credentials or inaccessible data
* an architectural expansion outside the requested scope
* a choice that cannot be inferred safely

If a simpler approach fully solves the task, prefer it.

## Real-Time Rendering Rules

For frame-driven code:

* do not use React state updates as a per-frame animation mechanism
* keep high-frequency values in refs, engine state, uniforms, or GPU buffers
* avoid allocations in hot paths
* reuse vectors, matrices, materials, buffers, and other resources
* dispose resources owned by removed systems
* use elapsed time or delta time, not frame counts
* use deterministic seeds where repeatability matters
* cap or adapt DPR deliberately
* measure before optimizing
* respect `prefers-reduced-motion`

Inside TSL `Fn()` blocks, do not rely on normal JavaScript variable reassignment for mutable shader state. Use version-compatible TSL operations such as `.assign()`, `.toVar()`, or `select()` where appropriate.

Post-processing should refine an already readable scene. It must not create the only visible silhouette, depth, or material separation.

## Design Standard

Treat frontend work as product and experience design, not decoration.

A strong change should improve at least one of:

* LENOX presence
* interaction clarity
* cinematic timing
* composition
* material quality
* responsive framing
* visual stability
* runtime performance

A technically valid result that looks generic or emotionally weak is not complete.

Do not claim that work is premium, cinematic, polished, or finished based only on code inspection.

Human visual acceptance remains the final authority.

## Verification

Inspect `package.json` before choosing commands.

During implementation, run the smallest relevant checks.

Before completion, run the complete relevant verification for the changed area.

For UI, motion, or layout changes:

* open the actual application in a browser
* inspect console and page errors
* test the affected interaction
* verify desktop and mobile layouts
* check text fit, overlap, clipping, and horizontal overflow
* check reduced-motion behavior when relevant

For WebGPU, TSL, shader, particle, or cinematic changes:

* inspect the actual rendered canvas
* test representative interaction states
* use consistent viewport and DPR for comparisons
* freeze seed, time, camera, pointer, and state where technically possible
* inspect motion at normal speed and around transition boundaries
* inspect performance after warm-up
* compare before and after under the same conditions

Do not infer GPU performance solely from CPU timing.

Never weaken, delete, bypass, or rewrite tests, references, baselines, diagnostics, or acceptance criteria merely to make a result pass.

Separate confirmed evidence from inference. If a check was skipped or blocked, state that directly.

## Autonomy and Stop Conditions

Auto Mode is intentional, but autonomy does not authorize scope expansion.

Do not commit, push, deploy, publish, delete data, modify production services, or change global Claude configuration unless explicitly instructed.

For autonomous `/goal` work, the prompt must define:

* the required outcome
* allowed scope
* protected scope
* verification
* stop conditions
* maximum attempts

Stop and report when:

* continuing would overwrite unrelated user work
* a required asset, credential, source, or decision is unavailable
* the task conflicts with a protected project invariant
* the same failure repeats without new evidence
* verification cannot establish whether the result works
* the remaining path requires unapproved architecture or dependencies
* further iterations produce no measurable improvement

Do not continue looping merely because more iterations are possible.

## Completion Report

Keep completion reports concise.

Include:

* what changed
* why it changed
* files changed
* checks performed
* relevant visual or performance evidence
* remaining concrete risks or limitations

Do not include generic recommendations, long process narration, or unsupported quality claims.
