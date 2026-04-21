# VOLKANO Technical Handbook

## GPU Runtime, Rendering Pipeline, State Contracts, Sequencing, and Implementation Discipline

This document defines the technical operating model for a production-grade real-time graphics runtime.
It is intentionally technical.
It focuses on architecture, state ownership, simulation discipline, rendering contracts, image pipeline order, debugability, and performance-safe implementation.

## Table of contents

| Part | Topic |
| --- | --- |
| [1](#1-core-runtime-philosophy) | Core runtime philosophy |
| [2](#2-ownership-model) | Ownership model |
| [3](#3-state-contract-design) | State contract design |
| [4](#4-frame-pipeline-contract) | Frame pipeline contract |
| [5](#5-render-architecture-rules) | Render architecture rules |
| [6](#6-helper-fields-and-precomputation) | Helper fields and precomputation |
| [7](#7-renderer-implementation-rules) | Renderer implementation rules |
| [8](#8-material-system-contract) | Material system contract |
| [9](#9-instanced-rendering-contract) | Instanced rendering contract |
| [10](#10-image-pipeline-contract) | Image pipeline contract |
| [11](#11-simulator-discipline) | Simulator discipline |
| [12](#12-camera-and-light-discipline) | Camera and light discipline |
| [13](#13-dom-page-lock-rules) | DOM / page lock rules |
| [14](#14-capability-negotiation-and-fallbacks) | Capability negotiation and fallbacks |
| [15](#15-performance-contract) | Performance contract |
| [16](#16-debug-and-verification-infrastructure) | Debug and verification infrastructure |
| [17](#17-sequence-design-patterns-that-fit-this-stack) | Sequence design patterns |
| [18](#18-anti-patterns) | Anti-patterns |
| [19](#19-recommended-technical-checklist-before-large-refactors) | Checklist before large refactors |
| [20](#20-preferred-bias-for-this-codebase) | Preferred bias for this codebase |
| [21](#21-example-minimal-runtime-integration) | Example minimal runtime integration |
| [22](#22-final-principle) | Final principle |

---

# 1. Core Runtime Philosophy

## 1.1 One runtime, one authoritative state graph

The system must behave like one coherent runtime.

That means:

- one authoritative runtime object
- one authoritative stage machine
- one authoritative sequence clock
- one authoritative source of truth for simulation state
- one authoritative pass graph

Do not build independent mini-runtimes in:

- renderer code
- camera code
- CSS
- ad-hoc React state
- per-effect helper modules

If two systems both believe they own progression, the runtime is already broken.

---

## 1.2 CPU orchestrates, GPU evolves

The CPU is not the animation engine.

CPU responsibilities:

- input collection
- stage transitions
- wall-clock progression
- uniform / buffer updates
- pass scheduling
- submit orchestration
- debug overlay / telemetry

GPU responsibilities:

- simulation state evolution
- field evaluation
- per-instance transform derivation
- material interpretation
- post-processing
- image assembly

Canonical frame contract:

`PARAM WRITE -> SIM / COMPUTE -> RENDER PASSES -> UI PASS -> SUBMIT`

This is the baseline mental model.
If the current code cannot be described this way, the architecture is drifting.

---

## 1.3 Explicit state beats emergent tuning

Every meaningful transition must be represented by explicit state.
Do not rely on visual emergence from many weak local tweaks.

Good runtime channels:

- `coolT`
- `thinT`
- `withdrawT`
- `opacityT`
- `backBiasT`
- `authorityLightT`
- `pushInT`
- `pageLockT`
- `heroT`

Good truth flags:

- `solverLocked`
- `withdrawalDone`
- `quietLocked`
- `cameraArrived`
- `pageLocked`
- `heroAllowed`

Bad:

- unrelated local multipliers with no semantic contract
- timing hidden inside shader branches
- CSS transitions guessing sequence completion
- renderer-only state that the rest of the runtime cannot inspect

---

## 1.4 Minimal active levers, maximal semantic clarity

Prefer a small number of high-authority signals over many weak tuners.

A strong system usually has:

- few runtime channels
- deterministic interpretation
- clean ownership
- stable phase boundaries
- low duplication of intent

A weak system usually has:

- too many local “fix” multipliers
- overlapping timing systems
- duplicated stage concepts
- effect-specific hacks that do not generalize

---

# 2. Ownership Model

## 2.1 Runtime / App owner

The runtime owns:

- canonical runtime object
- mapping from stage/time to technical signals
- distribution of runtime signals to simulator, renderer, lights, camera, and UI
- helper-field lifecycle
- post-processing control values
- truth flags and transition permissions

The runtime does not own:

- low-level per-instance geometry math
- shader-local procedural styling details
- DOM layout internals

### Example

```ts
export type RuntimeStage =
  | "idle"
  | "impact"
  | "cool"
  | "withdraw"
  | "quiet"
  | "push_in"
  | "page_lock"
  | "hero";

export type SequenceRuntime = {
  stage: RuntimeStage;
  elapsed: number;

  coolT: number;
  thinT: number;
  withdrawT: number;
  opacityT: number;
  backBiasT: number;
  authorityLightT: number;
  pushInT: number;
  pageLockT: number;
  heroT: number;

  solverLocked: boolean;
  withdrawalDone: boolean;
  quietLocked: boolean;
  cameraArrived: boolean;
  pageLocked: boolean;
  heroAllowed: boolean;
};
```

This object is the contract.  
Everything else consumes it.

---

## 2.2 Simulator owner

The simulator owns:

- live interactive motion before lock
- solver stepping
- particle state while unlocked
- pointer response while allowed
- field integration / force application while active

The simulator does not own:

- post-lock cinematics
- UI handoff
- CSS state
- camera choreography
- “storytelling” beats unless those beats are explicitly part of sim behavior

**Good simulator responsibilities**

- update position / velocity / density / phase
- apply pointer field
- enforce boundaries
- stop cleanly on lock

**Bad simulator responsibilities**

- deciding when UI should appear
- shaping hero arrival timing
- driving camera push-in
- inventing backwall authority through hidden rules

---

## 2.3 Renderer owner

The renderer owns:

- per-instance visual interpretation
- final visible form
- shading and material response
- silhouette treatment
- deterministic stagger
- post-lock reinterpretation when explicitly driven by runtime state

The renderer does not own:

- stage progression
- sequence truth
- user input policy
- UI gating

**Renderer may:**

- apply thermal cooling
- reduce silhouette thickness
- apply deterministic stagger
- apply slight depth surrender
- reduce emissive
- change bloom participation
- reinterpret material response

**Renderer must not:**

- author its own beat schedule
- invent hidden targets
- run secret phase timers
- simulate a second choreography

---

## 2.4 Camera / Light owner

Camera and light are a separate technical control channel.

They own:

- framing
- authority shift
- perceptual pressure
- spatial compression / release
- push-in / settle
- exposure and post look transitions

They do not own:

- particle logic
- sequence truth flags
- UI progression
- fixes for broken simulation or broken rendering

**Use camera/light to:**

- redirect attention
- confirm hierarchy
- finalize handoff
- stabilize image readability

**Do not use camera/light to:**

- compensate for weak actor logic
- mask broken rendering
- create false drama

---

## 2.5 DOM / CSS owner

DOM and CSS own:

- interface reveal
- layout authority
- page lock
- interface interactivity
- flatten / 3D-to-2D handoff

DOM and CSS do not own:

- fake particle motion
- fake thermal behavior
- fake retreat
- replacement of real scene events with decorative approximations

CSS is a finishing mechanism.  
It is not a substitute runtime.

---

# 3. State Contract Design

## 3.1 Stages must be executable, not descriptive

Do not define stages only in prose.  
Stages must map to inspectable runtime state.

**Example stage mapping**

```ts
const STAGES = {
  idle: 0,
  impact: 1,
  cool: 2,
  withdraw: 3,
  quiet: 4,
  push_in: 5,
  page_lock: 6,
  hero: 7,
} as const;
```

**Example stage edge emission**

```ts
function setStage(next: RuntimeStage) {
  if (runtime.stage === next) return;
  runtime.stage = next;
  events.emit("stage-change", next);
}
```

React / DOM should respond to stage edges, not infer state from time every frame.

---

## 3.2 Truth points are mandatory

Time alone is not enough.  
The system must expose explicit completion points.

**Examples:**

- `withdrawalDone`
- `quietLocked`
- `cameraArrived`
- `pageLocked`
- `heroAllowed`

These may be derived internally from continuous progress, but they must exist as named truth values.

**Example**

```ts
runtime.withdrawalDone = runtime.withdrawT >= 0.999;
runtime.quietLocked =
  runtime.withdrawalDone && quietHoldElapsed >= QUIET_HOLD_MS;
runtime.cameraArrived = runtime.pushInT >= 0.999;
runtime.pageLocked = runtime.pageLockT >= 0.999;
runtime.heroAllowed =
  runtime.pageLocked && runtime.cameraArrived && runtime.quietLocked;
```

This makes stage gating testable and debuggable.

---

## 3.3 Signals must be semantically independent

Each signal should mean one thing.

**Good:**

- `coolT` = thermal de-energizing
- `thinT` = silhouette narrowing
- `withdrawT` = global withdrawal progression
- `backBiasT` = subtle surrender into depth
- `authorityLightT` = authority transfer in lighting
- `pushInT` = camera movement progress
- `pageLockT` = flatten / layout lock progress
- `heroT` = interface statement arrival

**Bad:**

- one value driving both opacity and camera and CSS and bloom
- one “progress” uniform with many unrelated meanings

---

## 3.4 Cooling is not opacity

Cooling is its own channel.

**Cooling should affect:**

- emissive
- bloom participation
- chroma drift
- surface energy
- perceived pressure
- exposure relationship

Opacity is late and subordinate.

**Example**

```glsl
float emissiveGain = mix(1.0, 0.08, coolT);
vec3 cooledColor = mix(hotColor, cooledColorTarget, coolT);
float bloomMask = emissiveGain * visibleMask;
```

Do not use opacity to fake thermal behavior.

---

## 3.5 Thinning is not collapse

Silhouette thinning should preserve actor identity.

**For rod-based matter:**

- width may shrink
- edge softness may reduce
- thickness may skeletalize
- axial identity should remain readable for most of the transition

**Avoid:**

- sudden collapse into cubes
- voxel chunks unless explicitly intended
- “dust” conversion as a generic fallback

**Example**

```glsl
float rodWidth = mix(baseWidth, baseWidth * 0.18, thinT);
float rodLength = baseLength; // preserved for identity
```

---

## 3.6 Withdrawal is mostly local, not transport-driven

Withdrawal should primarily read as state change, not travel.

**Preferred ingredients:**

- cooling
- thinning
- controlled opacity surrender
- slight depth bias
- deterministic stagger

**Avoid:**

- visible corridor flow
- lane formation
- suction logic
- mass stream convergence
- organized pathing

**Good post-lock position treatment**

```glsl
vec3 pos = statePos;
pos.z += backBiasT * seedBackBias * BACK_BIAS_MAX;
```

**Bad post-lock treatment**

```glsl
vec3 pos = mix(statePos, riftTarget, withdrawT); // too literal if withdrawal is meant to read as state change
```

---

## 3.7 Asynchrony must be deterministic

Do not animate all instances in lockstep.  
Do not rely on unstable randomness.

**Use:**

- `instanceIndex`
- stable hash
- persistent seed textures
- immutable helper fields
- deterministic per-instance windows

**Example**

```glsl
float hash11(float n) {
  return fract(sin(n) * 43758.5453123);
}

float seed = hash11(float(instanceIndex));
float localDelay = mix(0.0, 0.22, seed);
float localWithdraw = smoothstep(localDelay, localDelay + 0.35, withdrawT);
```

This creates repeatable video output and stable debugging.

---

# 4. Frame Pipeline Contract

## 4.1 Param Write

The CPU writes only small, bounded runtime data.

**Allowed:**

- time
- delta
- pointer vector
- stage flags
- camera targets
- light targets
- uniform buffers
- debug toggles

**Forbidden in the hot path:**

- shader compilation
- FBO creation
- texture creation
- buffer reallocation
- geometry rebuild
- new typed arrays per frame

**Example**

```ts
runtimeBuffer.update(runtime);
lightBuffer.update(lightState);
cameraBuffer.update(cameraState);
```

---

## 4.2 Simulate / Compute

Simulation must stay GPU-resident.

**Valid implementation patterns:**

- ping-pong FBO textures
- state textures sampled in vertex shader
- structured storage buffers
- staged compute passes
- one-pass force-field kernel for simpler systems
- particle-to-grid / grid-to-particle only if complexity is justified

**Minimal v1 pattern**

- read previous position/velocity
- sample field / pointer influence
- apply damping + force
- integrate position
- write next position/velocity
- swap

**Staged pattern if needed**

`clear -> accumulate -> solve -> integrate -> bridge-to-render`

Do not start with a giant kernel unless the visual payoff is proven.

---

## 4.3 Render Passes

Every pass must be explicit.

**Each pass declares:**

- target
- clear behavior
- shader or material
- depth state
- blend state
- cull state
- required inputs

**Pass examples**

```text
simulationPass();
fieldMaskPass();
particlePass();
blurHorizontalPass();
blurVerticalPass();
compositePass();
uiPass();
```

Each pass must be isolated.  
No hidden state carry-over.

---

## 4.4 Submit

Submission is the final step.

World passes may be sorted or bucketed.  
UI must remain sequential and deterministic.

**Good model**

- record world render intent
- sort by pass/state where legal
- execute
- run UI pass in fixed order
- submit

This keeps UI stable while allowing optimized rendering.

---

# 5. Render Architecture Rules

## 5.1 Commands are effectively immutable

Render commands / materials / pipelines should be created at init time.

**Frame loop may only:**

- update uniform values
- update buffer data
- execute passes

**Never:**

- compile shaders inside frame loop
- re-create render targets in frame loop
- allocate geometry in frame loop

---

## 5.2 Explicit pass boundaries

Every pass must:

- bind its target explicitly
- clear intentionally
- declare dependencies
- restore or own needed state

**Example**

```ts
beginPass(thicknessFbo, { clearColor: [0, 0, 0, 0] });
renderThickness();
endPass();
```

Do not rely on “whatever was bound before”.

---

## 5.3 No hidden ownership leakage

**Bad:**

- particle material writes runtime truth back into app state
- CSS derives scene state by sampling DOM opacity
- camera stage inferred from post-processing brightness

**Good:**

- runtime computes truth
- renderer consumes truth
- DOM reacts to truth

---

# 6. Helper Fields and Precomputation

## 6.1 CPU-precomputed helper fields are allowed

Precomputation is acceptable when it produces immutable guidance data used by the GPU efficiently.

**Good helper fields:**

- per-instance withdrawal delay
- signature-minority weighting
- back-bias amplitude
- spatial falloff fields
- edge-preserve masks
- rear-authority masks
- silhouette-preserve weighting

**Bad:**

- per-frame CPU transform authoring for every particle
- CPU choreography loops replacing GPU evolution
- frame-to-frame helper field rebuilds without topology change

---

## 6.2 Build once, use many times

Helper fields should be:

- generated once
- uploaded once
- sampled many times

**Example**

```ts
const helperData = new Float32Array(count * 4);
// [withdrawDelay, backBias, minorityWeight, reserved]
uploadHelperTexture(helperData);
```

Do not regenerate unless particle topology or layout changed.

---

## 6.3 Helper fields must guide, not tell a second story

A helper field may shape timing or weighting.  
It must not smuggle in a hidden narrative.

**Example:**

- **good:** slightly stronger back-bias on minority group
- **bad:** secret point-to-point destination mapping for a whole secondary transition

---

# 7. Renderer Implementation Rules

## 7.1 Renderer-side position logic

Post-lock renderer-side position logic is acceptable if:

- it is driven by explicit runtime state
- it does not create a second physics system
- it does not read as transport choreography
- it remains subordinate to the actor identity

**Allowed ingredients:**

- subtle depth bias
- deterministic stagger
- small downward release if justified
- minor per-instance surrender offsets

**Not allowed:**

- large radial fan-outs
- slit targeting when the read is meant to be non-literal
- independent travel narrative
- unbounded noise rescue

---

## 7.2 Shape logic

Keep actor identity continuous.

**Recommended:**

- preserve rod identity through most of the sequence
- reduce width / thickness over time
- keep length stable until very late
- only reduce length when clearly motivated

**Example**

```glsl
vec3 local = positionLocal;
local.xz *= mix(1.0, 0.2, thinT);
```

This skeletalizes the form without replacing the actor.

---

## 7.3 Material logic

Material should support:

- thermal fade-down
- albedo compression
- emissive collapse
- chroma cooling
- bloom discipline
- near-zero-presence end state

**Example progression**

```glsl
vec3 albedo = mix(hotAlbedo, coolAlbedo, coolT);
float emissive = mix(baseEmissive, 0.05, coolT);
float alpha = mix(1.0, 0.0, opacityT);
```

**Avoid:**

- neon rescue
- late bloom that keeps dead matter visually alive
- random hue shifts not backed by state

---

## 7.4 Bloom discipline

Bloom must follow energy.  
Bloom must not preserve authority after authority is supposed to fall.

**Example:**

- cool down emissive before opacity loss completes
- reduce bloom participation early
- do not let bloom halos survive after actor authority is removed

---

## 7.5 Transparency / depth discipline

Transparent depth policy must be deliberate.

Pick a policy because of actual layering needs.  
Do not toggle `depthWrite` casually to “fix mush”.

**Questions to answer:**

- does the layer need order-independent accumulation?
- does it require early-z?
- is alpha-based disappearance subordinate or dominant?
- does it interact with other transparent layers?

Keep the answer consistent.

---

# 8. Material System Contract

## 8.1 Materials are contracts, not random shaders

**Separate:**

- material logic
- material instance data
- render state

**A material defines:**

- shading model
- blend mode
- culling
- depth behavior
- lighting participation
- domain

**A material instance defines:**

- bound parameters
- textures
- colors
- scalars
- per-shot overrides

**Example**

```ts
const particleMaterial = {
  model: "lit",
  blending: "transparent",
  depthWrite: false,
  cull: "back",
};

const particleInstance = {
  baseColor: [0.12, 0.12, 0.14],
  emissiveColor: [1.0, 0.38, 0.1],
  roughness: 0.72,
};
```

---

## 8.2 Structured material inputs

Prefer named, typed material inputs over loose uniforms.

**Good:**

- `baseColor`
- `roughness`
- `metallic`
- `opacity`
- `emissive`
- `thickness`
- `depthTint`
- `flowAmount`

**Bad:**

- `u1`, `u2`, `uPower`, `uShift`
- giant catch-all uniform bags

Structured inputs make tuning portable and debuggable.

---

## 8.3 Blend modes are semantic

Blend mode is part of the material contract.

**Use:**

- opaque
- masked
- transparent
- fade

**Use additive only when:**

- the signal is truly luminous
- the layer must accumulate energy
- sorting constraints justify it

Do not use additive blending as a generic “looks cool” mode.

---

## 8.4 Compile-time specialization over runtime branch sprawl

If a feature materially changes cost or behavior, prefer static specialization.

**Example cases:**

- vessel with refraction vs vessel without refraction
- particle material with bloom MRT output vs without
- debug false-color variant vs beauty pass variant

Avoid giant runtime branch trees in hot shaders.

---

# 9. Instanced Rendering Contract

## 9.1 Render from kernel state directly

The preferred pattern is:

- kernel owns state
- renderer samples state directly
- vertex logic derives transform from sampled data
- no CPU per-instance matrix updates

**Example**

```glsl
vec4 posData = texture(uPositionTex, instanceUv);
vec3 particlePos = posData.xyz;

vec4 velData = texture(uVelocityTex, instanceUv);
vec3 velocity = velData.xyz;
```

---

## 9.2 Oriented instance basis

For directional actors, orientation should be derived from real direction / velocity.

**Example**

```glsl
mat3 calcLookAtMatrix(vec3 dir, vec3 up) {
  vec3 z = normalize(dir);
  vec3 x = normalize(cross(up, z));
  vec3 y = cross(z, x);
  return mat3(x, y, z);
}
```

**Use this for:**

- rods
- strokes
- elongated quads
- directionally biased particles

Do not fake orientation with unrelated timeline axes.

---

## 9.3 Frustum culling rules

If instances move via GPU state across broad space:

- disable base-geometry frustum culling  
  **or**
- provide a conservative global bounds strategy

Otherwise particles may vanish incorrectly because the base geometry bounds are irrelevant.

---

## 9.4 Geometry choice must match visible read

Use geometry intentionally.

**Good mapping:**

- points = debug / low-cost fallback
- billboards = soft edge, cheap, camera-facing
- rods / strokes = directional read, authored form
- spheres = sparse hero particles only

Do not choose geometry by convenience alone.

---

# 10. Image Pipeline Contract

## 10.1 Correct image order

The image pipeline should follow this order:

- scene lighting in linear HDR
- screen-space effects and intermediate masks
- bloom source extraction
- blur / downsample / upsample
- bloom composite
- exposure adjustment / luminance adaptation
- white balance
- color grading
- tone mapping
- display transfer
- optional final grain / dithering

**Never:**

- do bloom after tone mapping
- grade in display space unless explicitly justified
- merge white balance, grading, and tone mapping into one vague “look” pass

---

## 10.2 Exposure is a system

Exposure is not a multiplier.  
Use a smoothed adaptation model.

**Example**

```ts
targetExposure = sampleSceneLuminance();
currentExposure = mix(
  currentExposure,
  targetExposure,
  1.0 - Math.exp(-dt / adaptationSpeed),
);
```

**This enables:**

- reduced flicker
- smoother transitions
- better highlight control
- more cinematic scene response

---

## 10.3 Tone mapping is part of identity

Tone mapping controls:

- highlight roll-off
- midtone stability
- shadow behavior

Choose one operator and treat it as part of the image identity.

Do not let tone mapping drift randomly between stages.

---

## 10.4 Bloom is energy-based

Bloom should respond to luminance, not arbitrary “glow amount”.

**Example bright-pass**

```glsl
float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
float b = max(luma - threshold, 0.0);
vec3 bright = color.rgb * (b / max(luma, 0.001));
```

This is more stable than faking glow with post-tonemap additive overlays.

---

## 10.5 Low-resolution signal strategy

Low-resolution buffers are valid for broad, low-frequency signals.

**Good uses:**

- bloom source
- broad authority mask
- large soft halo
- depth-softened fields

**Bad uses:**

- thin sharp lines
- typography
- geometry-critical edge reads
- fast high-frequency details

Use separable blur for large radii.

**Example**

`prefilter -> blurX -> blurY -> composite`

This is cheaper and more controllable than giant 2D blur kernels.

---

## 10.6 Fog is spatial, not decorative

Fog is allowed only as spatial attenuation and depth discipline.

**Use it to:**

- separate layers in depth
- keep distant contributions under control
- add subtle interior volume
- reduce far-field alias contamination

**Do not use fog to:**

- simulate smoke by proxy
- wash the frame
- hide weak composition

---

## 10.7 Temporal stability

A stable image is more expensive-looking than an unstable sharp image.

**For particle-heavy scenes:**

- reduce temporal shimmer
- smooth exposure transitions
- use stable thresholds
- consider TAA or supersampled downsampling where appropriate
- avoid noisy on/off cutoffs in alpha or bloom masks

---

# 11. Simulator Discipline

## 11.1 Lock semantics must be hard

When the solver locks, it must meaningfully stop.

**Good lock behavior:**

- no ongoing integration
- no hidden drift
- no remaining pointer force
- stable frame-to-frame base state

**Example**

```ts
if (runtime.solverLocked) {
  sim.pointerEnabled = false;
  sim.integrate = false;
  sim.freezeVelocity();
}
```

Do not leave half-alive motion unless explicitly required.

---

## 11.2 Do not build a second fire/smoke sim unless the payoff is proven

Borrow ideas, not whole subsystems.

**Useful borrowed ideas:**

- thermal channel separation
- cooling law thinking
- buoyancy metaphor
- vorticity-style micro-detail logic
- blackbody-inspired color logic

**Not useful by default:**

- full pressure solve
- full combustion model
- separate volumetric smoke stack
- new fuel/temperature field pipeline
- second major actor

---

## 11.3 Pointer policy must be explicit

When sequence begins:

- pointer influence ends immediately or within a tiny lock ramp
- pointer residue is cleared
- conflicting pointer-driven UI flourishes stop

No split-brain pointer behavior.

**Example**

```ts
if (runtime.stage !== "idle") {
  pointer.enabled = false;
  pointer.vector.set(0, 0, 0);
}
```

---

## 11.4 Stop conditions / solver phases are real UX tools

A solver should expose “finished enough” or “locked enough” truth values.

**Examples:**

- settled
- finished
- locked
- inactive

**These values are useful for:**

- stage transitions
- light gating
- UI gating
- profiling
- debugging

They are not just debug metadata.

---

# 12. Camera and Light Discipline

## 12.1 Light carries authority transfer

Lighting should begin shifting authority before actor absence is complete.

**Recommended progression:**

- exposure eases down or stabilizes
- bloom strength reduces early
- environment response cools
- rear-surface legibility increases before full absence
- final quiet beat gets stabilized lighting

This makes the authority shift feel causal instead of decorative.

---

## 12.2 Camera motion must be literal

Use small, deliberate motion.

- No orbiting.
- No dramatic re-aiming.
- No flourish.

**Good push-in:**

- short
- forward-biased
- aligned with existing spatial logic
- completed before or just as page lock finishes

**Example**

```ts
camera.position.z = mix(startZ, endZ, pushInT);
camera.lookAt(lockLookAt);
```

Keep it simple.

---

## 12.3 Camera and CSS must not compete continuously

Do not run equal-strength camera-space and CSS-space shifts for the whole handoff.

**Prefer:**

- camera leads
- CSS completes flatten / page lock late
- short stillness after camera settles
- interface arrives after spatial settlement

**Good handoff model**

`camera push -> late CSS lock -> quiet -> interface arrival`

**Bad handoff model**

camera and CSS both transforming the space at full strength for the full duration

That usually reads as technical confusion.

---

# 13. DOM / Page Lock Rules

## 13.1 CSS page lock is a finishing mechanism

CSS may finalize the handoff from spatial scene to flat interface.  
It should not be the main event.

---

## 13.2 CSS selectors must be stage-driven

Use explicit data attributes or class contracts.  
Do not rely on timing guesses.

**Example**

```html
<body
  data-stage="push_in"
  data-page-locked="false"
  data-hero-allowed="false"
>
```

This is superior to chaining unbounded transition timing assumptions.

---

## 13.3 CSS should not fake canvas behavior

Do not use CSS to fake:

- particle retreat
- thermal motion
- sequence completion
- missing scene authority

Fix scene truth first.

---

## 13.4 Page lock must end in a hard stable state

At the end of page lock:

- layout is stable
- perspective is settled
- interactivity is correct
- scroll policy is explicit
- hero text is readable
- focus order is coherent

No ambiguous in-between state.

---

# 14. Capability Negotiation and Fallbacks

## 14.1 Capability must be detected, not assumed

**At startup:**

- test render target support
- test float / half-float support
- test filtering support
- choose quality tier based on real capability

**Example fallback ladder**

```ts
const preferredFormats = ["RGBA32F", "RGBA16F", "RGBA8"];
```

Use the highest valid option, then degrade gracefully.

---

## 14.2 Manual filtering is a valid fallback

If float linear filtering is unavailable:

- use nearest  
  **or**
- do manual bilinear sampling in shader where required

Do not let unsupported hardware destroy the runtime.

---

## 14.3 Resolution splits are a major performance lever

Simulation, field, blur, and beauty passes do not need the same resolution.

**Valid examples:**

- simulation lower res
- field masks lower res
- bloom chain much lower res
- final beauty at screen res

This often yields better quality-per-cost than trying to run everything full res.

---

# 15. Performance Contract

## 15.1 No per-instance CPU choreography

Do not update thousands of matrices on CPU every frame unless there is absolutely no viable alternative.

**Prefer:**

- uniforms
- state textures
- helper textures
- structured buffers
- instance attributes
- shader-side derivation

---

## 15.2 Prefer stable GPU-side math over orchestration sprawl

A few deterministic shader-side operations are usually better than a huge CPU sequencing layer.

**Example:**

- **better:** seed-based stagger in shader
- **worse:** JS loop building per-instance delays every frame

---

## 15.3 Preserve hot-path austerity

**Avoid:**

- allocations in frame loop
- object churn
- repeated vector creation
- render target rebuilds
- React-driven per-frame structural changes
- layout thrash from high-frequency DOM mutations

---

## 15.4 Profile the actual bottleneck

Treat the runtime as a bottlenecked system.

**Possible bottlenecks:**

- CPU submission
- vertex cost
- fragment cost
- texture bandwidth
- framebuffer bandwidth
- post stack cost

Do not optimize blindly.

**Example method**

- change one stage’s cost
- measure frame time delta
- identify actual bottleneck
- optimize only that stage
- repeat

---

## 15.5 Telemetry is mandatory

**Expose:**

- draw call count
- pass count
- frame time
- GPU time where possible
- particle count
- sim step count
- active quality tier
- current exposure
- current stage

This prevents superstition-driven tuning.

---

# 16. Debug and Verification Infrastructure

## 16.1 Debug the state, not only the beauty pass

Temporary debug views should exist for:

- current stage
- `coolT`
- `thinT`
- `withdrawT`
- `backBiasT`
- `authorityLightT`
- `pushInT`
- `pageLockT`
- truth flags
- helper masks

**Example debug overlay payload**

```ts
{
  stage: runtime.stage,
  coolT: runtime.coolT.toFixed(2),
  thinT: runtime.thinT.toFixed(2),
  withdrawT: runtime.withdrawT.toFixed(2),
  solverLocked: runtime.solverLocked,
  pageLocked: runtime.pageLocked,
}
```

---

## 16.2 Debug views should be boring

**Prefer:**

- on-screen labels
- false-color masks
- simple logs
- captured stage markers
- pass isolation toggles

Avoid building a second product just for debugging.

---

## 16.3 State texture and pass inspection are high leverage

When using GPU state:

- visualize position texture
- visualize velocity texture
- visualize helper texture
- inspect intermediate blur/mask passes

This often reveals issues faster than beauty-pass guessing.

---

# 17. Sequence Design Patterns That Fit This Stack

## 17.1 Stable local withdrawal

Use when the goal is state change without readable travel.

**Recipe:**

- hard lock
- cooling ramp
- silhouette thinning
- deterministic staggered opacity surrender
- slight depth surrender
- quiet hold

---

## 17.2 Signature minority

Use when full synchronous surrender feels fake.

**Recipe:**

- majority withdraws locally
- minority persists slightly longer
- same material family
- same actor
- slightly stronger depth surrender
- no second effect layer

**Example**

```glsl
float minorityWeight = helper.z;
float minorityDelay = mix(0.0, 0.18, minorityWeight);
float minorityT = smoothstep(minorityDelay, minorityDelay + 0.25, withdrawT);
```

---

## 17.3 Guided page lock

Use when a scene-to-page handoff is required.

**Recipe:**

- actor authority falls
- light authority rises
- camera performs short push
- CSS completes page lock late
- interface lands after spatial settlement

---

## 17.4 Precomputed helper mask flow

Use when the shot needs structure without per-frame CPU authoring.

**Recipe:**

- build helper field once
- upload to GPU
- sample in shader
- mix with global runtime progress
- preserve determinism

---

## 17.5 Low-res authority mask

Use when a broad field or halo needs to influence the scene cheaply.

**Recipe:**

- render source to small target
- blur separably
- composite in controlled stage
- avoid using it for fine edge-critical content

---

# 18. Anti-Patterns

Avoid all of the following unless explicitly justified.

### 18.1 Hidden choreography

Renderer invents timing or hidden target logic.

### 18.2 Parallel unsynchronized owners

Runtime, renderer, camera, CSS, and app all running separate progress logic.

### 18.3 Global opacity-only disappearance

Reads as a hide trick.

### 18.4 Fully synchronous transition

Everything changes at once and looks synthetic.

### 18.5 Visible pathing when the concept is local withdrawal

This turns state change into transport.

### 18.6 Secondary actor syndrome

A new effect layer arrives to solve what the main actor failed to do.

### 18.7 Physics cargo culting

Importing smoke / fire / Navier-Stokes ideas wholesale when only signal patterns are needed.

### 18.8 CSS compensation for a broken scene

Fix scene authority first.

### 18.9 Beauty-first tuning with no state visibility

Leads to endless subjective tweaking.

### 18.10 Unbounded upgrade-path drift

Do not let future WebGPU/TSL ambition corrupt a clean v1 implementation.

---

# 19. Recommended Technical Checklist Before Large Refactors

## 19.1 Before coding

- name the intended read of each beat
- name the owner of each channel
- list runtime signals required
- list truth flags required
- list touched files
- define pass graph impact

---

## 19.2 Before merging

- verify idle / pre-sequence behavior is unchanged
- verify pointer lock policy
- verify stage edges in logs
- verify debug overlays
- verify aspect ratio behavior
- verify no ownership drift

---

## 19.3 Before polishing

- ensure sequence reads without text
- ensure final interface reads without particle rescue
- ensure light/camera support rather than compensate
- ensure state names still match real behavior

---

# 20. Preferred Bias for This Codebase

**Bias toward:**

- explicit runtime state
- deterministic GPU-side interpretation
- hard sim lock after handoff
- renderer-led post-lock reinterpretation
- small literal camera move
- late CSS page lock
- temporary debug instrumentation
- precomputed helper masks
- semantically small set of high-authority controls
- stable image pipeline
- typed state contracts

**Bias away from:**

- second particle actors
- entirely new sim systems
- broad architectural reinvention
- per-frame CPU steering
- parallel choreography systems
- vague beauty-only tuning
- shader spaghetti with product logic hidden inside

---

# 21. Example Minimal Runtime Integration

```ts
function updateFrame(dt: number) {
  runtime.elapsed += dt;

  sequenceController.update(runtime, dt);
  lightController.update(runtime, dt);
  cameraController.update(runtime, dt);

  runtimeBuffer.update(runtime);

  if (!runtime.solverLocked) {
    simulator.step(dt, runtime);
  }

  renderer.render({
    runtime,
    camera,
    lights,
    post,
  });

  domBridge.apply({
    stage: runtime.stage,
    pageLocked: runtime.pageLocked,
    heroAllowed: runtime.heroAllowed,
  });
}
```

**This is the intended hierarchy:**

- runtime updates truth
- sim evolves only while allowed
- render interprets truth
- DOM reacts to truth

---

# 22. Final Principle

The strongest real-time systems are built from:

- explicit state
- sparse ownership
- deterministic variation
- inspectable truth flags
- stable GPU contracts
- disciplined image pipeline order
- restrained handoff between simulation, rendering, light, camera, and DOM

A runtime becomes premium when every visible change can be traced to a small, legible, technically honest contract.
