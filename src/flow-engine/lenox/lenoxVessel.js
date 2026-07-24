import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createAuthoredLenox } from "./lenoxAuthoredCharacter.js";
import { createLenoxBody } from "./lenoxBody.js";

/**
 * Lenox vessel — the sphere-robot body (Sketchfab "360_sphere_robot_Done").
 *
 * GLB anatomy (verified against the binary, not guessed):
 *   glossy_paint_white   white shell
 *   black_matte          dark body details — shares its texture set with
 *                        the display; its EMISSIVE map carries the shipped
 *                        checkmark, its base color must stay untouched
 *   metal                trim
 *   eyes_light           small emissive decal quad on the visor (checkmark)
 *   black_matter_blender THE DISPLAY: flat inner screen inside the visor
 *   dark_glass           visor shell glass
 *   blender_glass        glass directly over the display
 *
 * The checkmark therefore has exactly two contributions: the eyes_light
 * decal mesh, and the emissive texture shared by black_matte /
 * black_matter_blender. Both are killed here — targeted, without flattening
 * the black body details (base color and normals stay intact).
 *
 * The display mesh becomes a dark, textureless screen. The existing ocular
 * rig (initLenoxGazeRig) renders in front of it and behind the glass. The
 * robot is the body; the rig stays the face.
 *
 * Scale: the sim parent scales space non-uniformly (x 1.6 / y 0.88 / z 1.1
 * of 1/64). A sphere must stay a sphere, so the vessel holds ONE uniform
 * world scale and counter-scales per axis against that parent.
 */

const VESSEL_URL = "/models/lenox-source/360_sphere_robot_Done.glb";
const AUTHORED_LENOX_URL = "/models/lenox/lenox-v006.glb";

const stripMaps = (mat) => {
  mat.map = null;
  mat.emissiveMap = null;
  mat.aoMap = null;
  mat.lightMap = null;
  mat.normalMap = null;
  mat.roughnessMap = null;
  mat.metalnessMap = null;
  mat.alphaMap = null;
  mat.specularMap = null;
};

export async function loadLenoxVessel({ parentScale } = {}) {
  const loader = new GLTFLoader();
  const [gltf, authoredGltf] = await Promise.all([
    loader.loadAsync(VESSEL_URL),
    loader.loadAsync(AUTHORED_LENOX_URL).catch((error) => {
      console.warn("[lenox] authored GLB load failed — keeping procedural fallback", error);
      return null;
    }),
  ]);
  const robot = gltf.scene;

  let displayMesh = null;
  const glassMeshes = [];
  /**
   * The meshes that define Lenox' SILHOUETTE — shell, dark body details and
   * trim. The particle birth samples these surfaces, so the mass collapses
   * into his actual shape and not into a bounding sphere. The display, both
   * glasses and the shipped checkmark decal are deliberately excluded: they
   * are interior or optical surfaces and would pull matter inside the head.
   */
  const shellMeshes = [];
  /** Base opacity per mesh, so the body can be revealed without losing tint. */
  const revealBase = new Map();
  let revealSolid = false;

  robot.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = false;
    child.receiveShadow = false;

    const mat = child.material;
    const name = (mat?.name ?? "").toLowerCase();

    if (name === "eyes_light") {
      // The shipped checkmark decal. Never rendered.
      child.visible = false;
      return;
    }

    if (name === "black_matter_blender") {
      // The display. Clone (its texture set is shared with black_matte) and
      // rebuild it as a dark, textureless screen with a little depth.
      const screen = mat.clone();
      screen.name = "lenox_display";
      stripMaps(screen);
      screen.color.set(0x05090c);
      screen.emissive?.set?.(0x00121a);
      screen.emissiveIntensity = 0.28;
      // Deep, matte screen: any gloss here becomes a second specular dot
      // competing with the signals it is supposed to carry.
      screen.metalness = 0;
      screen.roughness = 0.95;
      screen.envMapIntensity = 0.15;
      screen.transparent = false;
      screen.needsUpdate = true;
      child.material = screen;
      child.renderOrder = -1;
      displayMesh = child;
      return;
    }

    if (name === "black_matte") {
      // Body details keep their base color, normals and roughness. Only the
      // emissive contribution (the checkmark texture) is removed.
      mat.emissiveMap = null;
      mat.emissive?.set?.(0x000000);
      mat.emissiveIntensity = 0;
      // Keep the dark body out of terminal-black cosplay: it should catch a
      // broad studio edge, never a white pin.
      mat.roughness = Math.max(mat.roughness ?? 0.7, 0.68);
      mat.metalness = Math.min(mat.metalness ?? 0.0, 0.18);
      mat.envMapIntensity = 0.24;
      mat.needsUpdate = true;
      shellMeshes.push(child);
      revealBase.set(child, 1);
      // Transparent from the start: the birth fades the body in, and toggling
      // `transparent` at runtime recompiles the material mid-animation.
      mat.transparent = true;
      mat.depthWrite = true;
      return;
    }

    if (name === "glossy_paint_white") {
      // Satin silver, not white plastic and not full chrome. The environment
      // supplies the authored bands; this material only decides how honestly
      // the shell receives them.
      mat.color?.set?.(0xd5d9dc);
      mat.metalness = 0.68;
      mat.roughness = 0.26;
      mat.envMapIntensity = 0.88;
      mat.needsUpdate = true;
      shellMeshes.push(child);
      revealBase.set(child, 1);
      mat.transparent = true;
      mat.depthWrite = true;
      return;
    }

    if (name === "metal") {
      // Trim and small structural edges are allowed to carry the crispest band.
      // This is where the matcap reference belongs: controlled edge shine.
      mat.color?.set?.(0xc8ced3);
      mat.metalness = 0.96;
      mat.roughness = 0.18;
      mat.envMapIntensity = 0.92;
      mat.needsUpdate = true;
      shellMeshes.push(child);
      revealBase.set(child, 1);
      mat.transparent = true;
      mat.depthWrite = true;
      return;
    }

    if (name.includes("glass")) {
      // The visor reads as glass, not a wall: see-through, no depth write,
      // drawn after the rig so the face sits visibly BEHIND it.
      mat.transparent = true;
      mat.opacity = name === "dark_glass" ? 0.34 : 0.42;
      mat.depthWrite = false;
      mat.emissive?.set?.(0x000000);
      // Smoked glass, not a mirror. At the shipped roughness the key spot and
      // the HDRI collapse into small, hard white points ON the visor — and a
      // bright dot beside a cyan eye is read as a second eye. High roughness
      // smears them into a broad sheen; the reflection survives, it just can
      // never resolve into something the eye mistakes for a signal.
      mat.roughness = 0.94;
      mat.metalness = 0;
      mat.envMapIntensity = 0.075;
      mat.needsUpdate = true;
      child.renderOrder = 30;
      glassMeshes.push(child);
      revealBase.set(child, mat.opacity);
    }
  });

  // Orientation first, then measure. The camera looks from -z toward +z, so
  // the robot's face (which points +z in the loaded model) is turned around.
  const orient = new THREE.Group();
  orient.add(robot);
  orient.rotation.y = Math.PI;
  orient.scale.set(1, 1, 1);
  orient.updateMatrixWorld(true);

  // Bounds at unit scale, i.e. in world units per one unit of vessel scale.
  const modelBox = new THREE.Box3().setFromObject(robot);
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const displayBox = new THREE.Box3().setFromObject(displayMesh ?? robot);
  const displaySize = displayBox.getSize(new THREE.Vector3());
  const displayCenter = displayBox.getCenter(new THREE.Vector3());
  /** Display center → sphere center. This is the pivot a head turns around. */
  const centerOffset = modelCenter.clone().sub(displayCenter);

  // Phase-1 final-form body. It lives inside the same uniformly scaled and
  // oriented vessel as the core, so it inherits gaze, breath and reveal
  // without creating another scene root or animation authority.
  const gravityBody = createLenoxBody({ modelSize, modelCenter });
  orient.add(gravityBody.root);

  const root = new THREE.Group();
  root.add(orient);

  const authored = authoredGltf
    ? createAuthoredLenox({
        scene: authoredGltf.scene,
        animations: authoredGltf.animations,
        parentScale,
      })
    : null;
  if (authored) {
    authored.root.visible = false;
    root.add(authored.root);
  }

  const px = parentScale?.x ?? 1;
  const py = parentScale?.y ?? 1;
  const pz = parentScale?.z ?? 1;
  let authoredMix = 0;

  const vessel = {
    root,
    /** Unit-scale metrics (world units at vessel scale 1). */
    modelHeight: Math.max(modelSize.y, 1e-4),
    modelWidth: Math.max(modelSize.x, 1e-4),
    displayWidth: Math.max(displaySize.x, 1e-4),
    displayHeight: Math.max(displaySize.y, 1e-4),
    worldScale: 1,
    gravityBody,
    authored,
    hasAuthoredCharacter: !!authored,

    /**
     * Fit the robot to a target height in WORLD units. The uniform world
     * scale is expressed per-axis against the sim parent so the sphere stays
     * round, and the display center is pinned to the root origin (= the rig
     * face center), so the eyes always sit in the middle of the screen.
     */
    fitToWorldHeight(targetWorldHeight) {
      const k = Math.max(targetWorldHeight, 1e-4) / vessel.modelHeight;
      vessel.worldScale = k;
      orient.scale.set(k / px, k / py, k / pz);
      orient.position.set(
        (-displayCenter.x * k) / px,
        (-displayCenter.y * k) / py,
        (-displayCenter.z * k) / pz,
      );
      orient.updateMatrixWorld(true);
      authored?.fitToWorldHeight(targetWorldHeight);
      return k;
    },

    /** Display size in WORLD units at the current fit. */
    displayWorldSize() {
      return {
        width: vessel.displayWidth * vessel.worldScale,
        height: vessel.displayHeight * vessel.worldScale,
      };
    },

    /** Shell + trim meshes; the silhouette the particle birth collapses into. */
    shellMeshes,

    /**
     * Fade the whole body in or out. The birth crossfades the particle mass
     * into the shell, so the robot is never simply switched on.
     */
    setReveal(t) {
      const v = Math.max(0, Math.min(t, 1));
      authoredMix = authored ? THREE.MathUtils.smoothstep(v, 0.94, 0.995) : 0;
      const fallbackReveal = v * (1 - authoredMix);
      authored?.setReveal(authoredMix);
      robot.visible = fallbackReveal > 0.002;
      // Preserve the protected core materialisation: its sampled shell targets
      // remain byte-identical. The new limbs resolve only in the final part of
      // the existing body handoff instead of pulling wake matter off-course.
      gravityBody.setReveal(
        THREE.MathUtils.smoothstep(v, 0.72, 0.96) * (1 - authoredMix),
      );
      // Once the body is fully there it must go OPAQUE again. Leaving the shell
      // permanently transparent changes its sort order and speckles the solid
      // surfaces (the top cap grains visibly). Toggled once per edge, never
      // per frame — flipping `transparent` recompiles the material.
      const solid = v >= 0.999;
      if (solid !== revealSolid) {
        revealSolid = solid;
        for (const mesh of revealBase.keys()) {
          if (glassMeshes.includes(mesh)) continue;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) {
            if (!mat) continue;
            mat.transparent = !solid;
            mat.needsUpdate = true;
          }
        }
      }

      for (const [mesh, base] of revealBase) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (!mat) continue;
          mat.opacity = base * fallbackReveal;
        }
        mesh.visible = fallbackReveal > 0.002;
      }
    },

    isAuthoredVisible() {
      return authoredMix > 0.98;
    },

    /** Engine-owned hybrid pose for the procedural fallback and authored GLB. */
    updateBody(spec) {
      const state = gravityBody.update(spec);
      authored?.update(spec);
      return state;
    },

    /**
     * Sample `count` points on the real outer surfaces, area-weighted, and
     * return them in SIM space — the coordinate system the solver's settle
     * targets live in.
     *
     * The body must be measured in its FINAL pose: the vessel is scaled by the
     * presence envelope and the head yaws toward the cursor, so sampling the
     * live transform would bake a shrunken, rotated silhouette into the
     * targets. Both are neutralised for the duration of the sample.
     */
    sampleSurfaceSim(count, simObject, target) {
      if (!simObject || shellMeshes.length === 0 || count <= 0) return null;

      const savedScale = root.scale.clone();
      const head = root.parent;
      const savedRotation = head ? head.rotation.clone() : null;
      root.scale.set(1, 1, 1);
      if (head) head.rotation.set(0, 0, 0);
      root.updateWorldMatrix(true, true);
      simObject.updateWorldMatrix(true, false);

      const simFromWorld = new THREE.Matrix4()
        .copy(simObject.matrixWorld)
        .invert();
      const toSim = new THREE.Matrix4();

      // Area-weighted triangle table across every shell mesh, in sim space.
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      const ab = new THREE.Vector3();
      const ac = new THREE.Vector3();
      const normal = new THREE.Vector3();
      const tris = [];
      let totalArea = 0;

      for (const mesh of shellMeshes) {
        const geometry = mesh.geometry;
        const position = geometry?.attributes?.position;
        if (!position) continue;
        toSim.multiplyMatrices(simFromWorld, mesh.matrixWorld);
        const index = geometry.index;
        const triCount = (index ? index.count : position.count) / 3;
        for (let t = 0; t < triCount; t++) {
          const i0 = index ? index.getX(t * 3) : t * 3;
          const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
          const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
          a.fromBufferAttribute(position, i0).applyMatrix4(toSim);
          b.fromBufferAttribute(position, i1).applyMatrix4(toSim);
          c.fromBufferAttribute(position, i2).applyMatrix4(toSim);
          ab.subVectors(b, a);
          ac.subVectors(c, a);
          const area = normal.crossVectors(ab, ac).length() * 0.5;
          if (!(area > 1e-9)) continue;
          // The silhouette is read from the RIM, so the back must keep its
          // matter — thinning it out would dissolve the very contour that
          // carries the trick. It is only damped: the front and the visor
          // frame get denser, which is where the shape becomes legible.
          const facing = normal.z / (area * 2);
          const weight = area * (facing < 0 ? 1 : 0.62);
          totalArea += weight;
          tris.push({
            ax: a.x, ay: a.y, az: a.z,
            bx: b.x, by: b.y, bz: b.z,
            cx: c.x, cy: c.y, cz: c.z,
            nx: normal.x / (area * 2), ny: normal.y / (area * 2), nz: normal.z / (area * 2),
            cum: totalArea,
          });
        }
      }

      root.scale.copy(savedScale);
      if (head && savedRotation) head.rotation.copy(savedRotation);
      root.updateWorldMatrix(true, true);

      if (tris.length === 0 || totalArea <= 0) return null;

      const out = target && target.length >= count * 3
        ? target
        : new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        // Area-weighted pick, so big panels get proportionally more matter.
        const pick = Math.random() * totalArea;
        let lo = 0;
        let hi = tris.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (tris[mid].cum < pick) lo = mid + 1;
          else hi = mid;
        }
        const tri = tris[lo];

        // Uniform barycentric sample.
        let u = Math.random();
        let v = Math.random();
        if (u + v > 1) {
          u = 1 - u;
          v = 1 - v;
        }
        const w = 1 - u - v;

        // A SKIN, not a cloud. The first cut scattered the mass ±0.45 sim units
        // around the surface, and that fuzz is what made the shell read as a
        // cotton ball instead of liquid silver: the silhouette was there, it
        // just drowned in lint. A thin, slightly outward-biased crust keeps the
        // contour crisp.
        const shell = (Math.random() - 0.3) * 0.3;

        out[i * 3] =
          tri.ax * w + tri.bx * u + tri.cx * v + tri.nx * shell;
        out[i * 3 + 1] =
          tri.ay * w + tri.by * u + tri.cy * v + tri.ny * shell;
        out[i * 3 + 2] =
          tri.az * w + tri.bz * u + tri.cz * v + tri.nz * shell;
      }

      return out;
    },

    /**
     * Offset from the display center to the SPHERE center, in sim units at the
     * current fit. A head that yaws around its visor slides; a head that yaws
     * around its own center turns. This is that pivot.
     */
    centerOffsetSim(target = new THREE.Vector3()) {
      const k = vessel.worldScale;
      return target.set(
        (centerOffset.x * k) / px,
        (centerOffset.y * k) / py,
        (centerOffset.z * k) / pz,
      );
    },
  };

  vessel.fitToWorldHeight(vessel.modelHeight);
  return vessel;
}
