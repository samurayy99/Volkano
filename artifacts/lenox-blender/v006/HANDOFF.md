# LENOX v006 — technical handoff

**Status:** production asset and runtime contract technically verified; visual approval remains with Volkan and the team.

## Source and reproducibility

- Form authority: `docs/character/lenox-canonical-reference.png`
- Immutable canonical-derived scan: `assets/lenox/source/lenox-v006-generated-source.glb`
- Production Blender file: `assets/lenox/lenox-v006.blend`
- Generator: `tools/blender/generate_lenox_v006.py`
- Frozen-blend exporter: `tools/blender/export_lenox_v006.py`
- Independent verifier: `tools/blender/verify_lenox_v006.py`
- Render-only entrypoint: `tools/blender/render_lenox_v006.py`
- Runtime GLB: `public/models/lenox/lenox-v006.glb`
- Verified toolchain: Blender 5.2.0 LTS at `/Applications/Blender.app/Contents/MacOS/Blender`

The scan is retained as visual evidence only. Its roughly 1,943 disconnected
shell components are not used as runtime topology. The generator voxel-remeshes
it into a closed 535,620-triangle sculpt source and derives a budget-targeted
34,000-triangle deformable body/primary-arm cage. Source Base Color is sampled
from the nearest source triangle using barycentric UV interpolation and bilinear
texture sampling, cleaned on the closed high-resolution sculpt, then baked to
the cage. This is not a nearest-vertex color transfer. Normal and roughness stay
independent maps.

Blender's voxel-remesh/decimate stages are structurally reproducible but not
byte-deterministic: isolated rebuilds preserve all verified counts and contracts,
while some float accessor bytes can differ. The frozen production `.blend` is
therefore the promotion source of truth. Repeated runs of
`export_lenox_v006.py` from that file must produce a byte-identical GLB.

## Verified export contract

| Check | Result |
|---|---:|
| GLB size | 2,715,604 bytes |
| Exported triangles | 37,868 |
| Meshes / primitives | 8 / 8 |
| Materials | 5 |
| Textures | 4 × 512×512 |
| Skin | 1 |
| Primary control chains | 6 (2 lead + 4 support) |
| Visible arms | 8 (6 authored in the cage + 2 coupled secondary meshes) |
| Maximum bone influences | 2 |
| Morph targets | `Concerned`, `Confirm`, `Thinking` |
| Animation | `LENOX_v006_MotionExpression_Test` |
| Compression | no Draco, no meshopt, no WebP extension |

The two secondary meshes are weighted to `Arm_Support_Side_L_*` and
`Arm_Support_Side_R_*`; no eight-chain rig was introduced. The final structural
eye pass locally recesses the source-derived eye regions in the closed sculpt.
There are no exported sclera spheres, glint stickers, neutral brow ribbons or
upper-lid line meshes. Small outward-angled domed iris/cornea meshes sit inside
the source-derived facial sockets and follow `Eye.L/R`; pupils and dark limbi
remain integrated into the iris texture. The required morph names remain on the
mouth and fin channels; expression strengthening is deferred to the final
session.

## Runtime

`src/flow-engine/lenox/lenoxVessel.js` loads `lenox-v006.glb` with the normal
`GLTFLoader`. `lenoxAuthoredCharacter.js` validates the bone, morph, skin,
animation and arm metadata contract before accepting it. A concrete warning is
emitted and the existing procedural character remains active if validation or
loading fails.

No renderer, render loop, state machine, scroll listener, decoder dependency or
protected WAKE materialization path was added.

## Inspection artifacts

- `inspection-front-neutral.png`
- `inspection-three-quarter.png`
- `silhouette-v006-96px.png`
- `silhouette-v006-64px.png`
- `expression-neutral.png`
- `expression-observe.png`
- `expression-concerned.png`
- `expression-confirm.png`
- `expression-contact-sheet.png`
- `look-source-front.png` / `look-production-front.png`
- `look-source-three-quarter.png` / `look-production-three-quarter.png`
- `look-source-closeup-eye-fin.png` / `look-production-closeup-eye-fin.png`
- `source-production-three-quarter.png`
- `source-production-closeup-eye-fin.png`
- `source-production-look-contact-sheet.png`
- `reef-production-front.png`
- `reef-production-three-quarter.png`
- `reef-production-closeup-eye-fin.png`

These are technical inspection renders, not visual approval.

## Open for visual judgment

- exact likeness to the canonical PNG
- whether the recovered Production color is rich enough beside the source
- remaining close-up transfer/decimation specks and low-poly surface facets
- final human judgment of eye depth, socket integration and iris character
- fin charm, outer-edge softness and rib treatment
- whether the two coupled arms should be quieter in the final debugging session
- expression strength and in-context animation timing

The front-derived landmarks are reference-bound. Side depth, rear anatomy and
back-arm placement remain controlled interpretation because no canonical side or
back orthographic views exist.
