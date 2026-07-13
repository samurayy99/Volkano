import * as THREE from "three/webgpu";
import {
  float,
  Fn,
  mx_fractal_noise_float,
  normalize,
  positionLocal,
  screenCoordinate,
  smoothstep,
  uniform,
  vec2,
  vec3,
} from "three/tsl";

/**
 * THE BACKDROP — a piano-lacquer panel, not a picture of one.
 *
 * Every previous attempt painted light: a glow, a fog, a gradient. This one
 * paints a SURFACE and lets it catch light. That is the whole difference, and
 * it is why this cannot look like "a background effect":
 *
 *   – There is no emission. The panel is near-black graphite. Everything you
 *     see is a REFLECTION, and reflections are the only place the deep navy is
 *     allowed to exist.
 *   – The structure is a normal field, not a brightness field. Three broad
 *     facet bands warp the surface; roughness varies across it. Nothing about
 *     it is drawn — it is shaded.
 *   – The pointer moves the LIGHT ANGLE, never the brightness. Moving the mouse
 *     sweeps a highlight across the facets exactly like tilting a lacquered
 *     panel under a lamp. Its brightness never changes; only where it lands.
 *   – It has NO time input. Nothing here animates on its own. Stillness is what
 *     separates a material from a screensaver.
 *
 * And it inverts the studio convention on purpose: it is DARKEST directly
 * behind Lenox. A product gets a light pool behind it so its silhouette reads.
 * Lenox is himself the light source — a bright pool behind two glowing cyan
 * capsules destroys the only signal that matters.
 */

/** Near-black lacquer. The panel's own colour; almost never seen directly. */
const LACQUER = new THREE.Color(0x05070a);
/** Deep navy: the colour of what the lacquer reflects. Never emitted. */
const REFLECTION_NAVY = new THREE.Color(0x16243a);
/** The specular core — cold, restrained, never white. */
const REFLECTION_SILVER = new THREE.Color(0x3a4450);
/** Floor base: the liquid surface is black first, reflective second. */
const FLOOR_GRAPHITE = new THREE.Color(0x030507);
/** The controlled silver read borrowed from the matcap reference. */
const FLOOR_SILVER = new THREE.Color(0x8c98a4);
/** Cyan is only allowed as a faint cognition reflection. */
const FLOOR_CYAN = new THREE.Color(0x274c55);

const seeded = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const createSilverDust = () => {
  const count = 180;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r1 = seeded(i + 1);
    const r2 = seeded(i + 31.7);
    const r3 = seeded(i + 91.2);
    const r4 = seeded(i + 143.6);
    positions[i * 3] = (r1 - 0.5) * 2;
    positions[i * 3 + 1] = (r2 - 0.5) * 1.35;
    positions[i * 3 + 2] = (r3 - 0.5) * 0.38;
    sizes[i] = 0.7 + r4 * 1.6;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x9ba7b2,
    size: 0.008,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  material.userData.sizes = sizes;

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -985;
  return points;
};

const createLiquidFloor = () => {
  const material = new THREE.MeshBasicNodeMaterial({
    toneMapped: false,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  material.colorNode = Fn(() => {
    const p = positionLocal.xy.toVar("floorP");
    const xAbs = p.x.abs().toConst("floorXAbs");

    const edgeFade = float(1)
      .sub(smoothstep(float(0.62), float(1.04), xAbs))
      .mul(float(1).sub(smoothstep(float(0.88), float(1.08), p.y.abs())))
      .clamp(0, 1)
      .toConst("floorEdgeFade");

    // Elliptical reflection under Lenox: wide, quiet, never a glowing blob.
    const reflectionCore = float(1)
      .sub(smoothstep(float(0.0), float(0.54), xAbs))
      .mul(float(1).sub(smoothstep(float(-0.14), float(0.86), p.y)))
      .mul(smoothstep(float(-0.94), float(-0.18), p.y))
      .toConst("floorReflectionCore");

    const wave = p.y
      .mul(42)
      .add(p.x.mul(6.5))
      .sin()
      .mul(0.5)
      .add(0.5)
      .toConst("floorWave");

    const ripple = float(1)
      .sub(smoothstep(float(0.0), float(0.08), wave.sub(0.5).abs()))
      .mul(float(1).sub(smoothstep(float(0.36), float(1.0), xAbs)))
      .mul(0.09)
      .toConst("floorRipple");

    const horizonSheen = smoothstep(float(0.18), float(0.92), p.y)
      .mul(float(1).sub(smoothstep(float(0.5), float(1.0), xAbs)))
      .mul(0.18)
      .toConst("floorHorizonSheen");

    const vignette = float(0.62)
      .add(edgeFade.mul(0.38))
      .toConst("floorVignette");

    const graphite = vec3(FLOOR_GRAPHITE.r, FLOOR_GRAPHITE.g, FLOOR_GRAPHITE.b);
    const silver = vec3(FLOOR_SILVER.r, FLOOR_SILVER.g, FLOOR_SILVER.b);
    const cyan = vec3(FLOOR_CYAN.r, FLOOR_CYAN.g, FLOOR_CYAN.b);

    const hash = screenCoordinate.xy
      .dot(vec2(12.9898, 78.233))
      .sin()
      .mul(43758.5453)
      .fract()
      .sub(0.5)
      .mul(1 / 255)
      .toConst("floorDither");

    return graphite
      .add(silver.mul(reflectionCore.mul(0.42).add(ripple)))
      .add(cyan.mul(horizonSheen))
      .mul(vignette)
      .add(hash);
  })();

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.frustumCulled = false;
  mesh.renderOrder = -990;
  return mesh;
};

export function createLenoxBackdrop() {
  const uniforms = {
    /** Light direction, driven by the pointer. Angle only — never intensity. */
    light: uniform(new THREE.Vector3(0.35, 0.4, 1)),
    /** Half-extents of the panel in world units (from the camera frustum). */
    extent: uniform(new THREE.Vector2(3, 3)),
    /** Lenox' position on the panel; the surface stays darkest there. */
    center: uniform(new THREE.Vector2(0, 0)),
    /** How deep the pool behind him is. */
    depth: uniform(0.62),
  };

  const material = new THREE.MeshBasicNodeMaterial({
    toneMapped: false,
    depthWrite: true,
    side: THREE.FrontSide,
  });

  material.colorNode = Fn(() => {
    const p = positionLocal.xy.mul(uniforms.extent).toVar("bdP");

    // --- the surface: three broad facet bands ------------------------------
    // Sines, because their derivatives are exact and free — a noise-based
    // height field would need finite differencing, i.e. two extra samples per
    // band, for a shape the eye cannot tell apart at this scale anyway.
    const d1 = vec2(0.94, 0.34);
    const d2 = vec2(-0.42, 0.91);
    const d3 = vec2(0.66, -0.75);
    const f1 = float(1.15);
    const f2 = float(0.72);
    const f3 = float(2.05);
    const a1 = float(0.09);
    const a2 = float(0.14);
    const a3 = float(0.035);

    const t1 = p.dot(d1).mul(f1).toConst("bdT1");
    const t2 = p.dot(d2).mul(f2).toConst("bdT2");
    const t3 = p.dot(d3).mul(f3).toConst("bdT3");

    // dh/dx and dh/dy of h = Σ aᵢ·sin(fᵢ·(p·dᵢ))
    const dhdx = t1
      .cos()
      .mul(a1.mul(f1).mul(d1.x))
      .add(t2.cos().mul(a2.mul(f2).mul(d2.x)))
      .add(t3.cos().mul(a3.mul(f3).mul(d3.x)))
      .toConst("bdDhdx");
    const dhdy = t1
      .cos()
      .mul(a1.mul(f1).mul(d1.y))
      .add(t2.cos().mul(a2.mul(f2).mul(d2.y)))
      .add(t3.cos().mul(a3.mul(f3).mul(d3.y)))
      .toConst("bdDhdy");

    const n = normalize(vec3(dhdx.negate(), dhdy.negate(), float(1))).toConst(
      "bdNormal",
    );

    // --- roughness varies across the panel ---------------------------------
    // Lacquer is never uniform. This is the only noise in the shader, and it
    // modulates the SHARPNESS of reflections, not their colour or brightness.
    const rough = mx_fractal_noise_float(vec3(p.mul(0.55), float(0)), 2, 2, 0.5)
      .mul(0.5)
      .add(0.5)
      .mul(0.55)
      .add(0.25)
      .toConst("bdRough");
    const gloss = float(1).sub(rough).toConst("bdGloss");
    // Rough patches spread their highlight; polished ones concentrate it.
    const sharpness = float(14).add(gloss.pow(float(3)).mul(520)).toConst(
      "bdSharpness",
    );

    // --- the light: the pointer only tilts it ------------------------------
    const l = normalize(uniforms.light).toConst("bdL");
    const v = vec3(0, 0, 1);
    const h = normalize(l.add(v)).toConst("bdH");

    const spec = n
      .dot(h)
      .max(0)
      .pow(sharpness)
      .mul(gloss.mul(0.7).add(0.3))
      .toConst("bdSpec");

    // A very soft wash so the facet bands have body instead of floating.
    const wash = n.dot(l).max(0).pow(float(2.2)).mul(0.055).toConst("bdWash");

    // Grazing sheen — the thing that says "lacquer" rather than "matte paint".
    const fresnel = float(1)
      .sub(n.z)
      .max(0)
      .pow(float(3))
      .mul(0.9)
      .toConst("bdFresnel");

    // --- darkest exactly where Lenox is ------------------------------------
    const dist = p.sub(uniforms.center).length().toConst("bdDist");
    const pool = float(1)
      .sub(
        uniforms.depth.div(
          float(1).add(dist.mul(dist).mul(1.35)),
        ),
      )
      .clamp(0, 1)
      .toConst("bdPool");

    const lacquer = vec3(LACQUER.r, LACQUER.g, LACQUER.b);
    const navy = vec3(
      REFLECTION_NAVY.r,
      REFLECTION_NAVY.g,
      REFLECTION_NAVY.b,
    );
    const silver = vec3(
      REFLECTION_SILVER.r,
      REFLECTION_SILVER.g,
      REFLECTION_SILVER.b,
    );

    const color = lacquer
      .add(navy.mul(wash.add(fresnel.mul(0.35))))
      .add(silver.mul(spec))
      .mul(pool)
      .toConst("bdColor");

    // Dither. A panel this dark and this smooth WILL band in 8-bit, and visible
    // banding in the darks is the single thing that makes a black look cheap.
    const hash = screenCoordinate.xy
      .dot(vec2(12.9898, 78.233))
      .sin()
      .mul(43758.5453)
      .fract()
      .toConst("bdHash");

    return color.add(hash.sub(0.5).mul(1 / 255));
  })();

  const object = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  object.add(mesh);

  const floor = createLiquidFloor();
  const dust = createSilverDust();
  object.add(floor, dust);

  return {
    object,
    mesh,
    floor,
    dust,
    uniforms,
    configure({ center, panelZ, halfW, halfH, aspect }) {
      mesh.position.set(center.x, center.y, panelZ);
      mesh.scale.set(halfW, halfH, 1);
      uniforms.extent.value.set(halfW, halfH);

      const floorY = center.y - halfH * (aspect < 0.85 ? 0.48 : 0.42);
      floor.position.set(center.x, floorY, center.z + 0.34);
      floor.scale.set(halfW * 0.95, halfH * (aspect < 0.85 ? 0.55 : 0.42), 1);

      dust.position.set(center.x, center.y + halfH * 0.04, center.z + 0.82);
      dust.scale.set(halfW, halfH * 0.72, 1);
    },
    dispose() {
      object.parent?.remove(object);
      mesh.geometry.dispose();
      material.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      dust.geometry.dispose();
      dust.material.dispose();
    },
  };
}
