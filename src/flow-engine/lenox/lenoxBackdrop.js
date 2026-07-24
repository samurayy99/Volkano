import * as THREE from "three/webgpu";
import {
  atan,
  float,
  Fn,
  mix,
  mx_fractal_noise_float,
  normalize,
  positionLocal,
  positionWorld,
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

/**
 * SIGNATURE PALETTE — the six world colours, as uniforms instead of constants
 * (DER BEGLEITER, Slice 1). Each exists twice: the CURRENT world and the
 * TARGET world; the scan front mixes between them per fragment. Defaults are
 * byte-identical to the previous constants (OBSIDIAN).
 *
 *   panelLacquer     — near-black lacquer; the panel's own colour
 *   panelReflection  — what the lacquer reflects (was: deep navy); never emitted
 *   panelSpecular    — the specular core; cold, restrained, never white
 *   floorBase        — the liquid surface is base-colour first, reflective second
 *   floorReflection  — the controlled read under Lenox (dark in bright worlds)
 *   floorSheen       — the faint cognition reflection on the horizon
 */
const createSignatureUniforms = () => ({
  panelLacquer: uniform(new THREE.Color(0x05070a)),
  panelReflection: uniform(new THREE.Color(0x16243a)),
  panelSpecular: uniform(new THREE.Color(0x3a4450)),
  floorBase: uniform(new THREE.Color(0x030507)),
  floorReflection: uniform(new THREE.Color(0x8c98a4)),
  floorSheen: uniform(new THREE.Color(0x274c55)),
  panelLacquerTo: uniform(new THREE.Color(0x05070a)),
  panelReflectionTo: uniform(new THREE.Color(0x16243a)),
  panelSpecularTo: uniform(new THREE.Color(0x3a4450)),
  floorBaseTo: uniform(new THREE.Color(0x030507)),
  floorReflectionTo: uniform(new THREE.Color(0x8c98a4)),
  floorSheenTo: uniform(new THREE.Color(0x274c55)),
  /** The reconstruction front: world-space origin (Lenox) and radius. */
  scanOrigin: uniform(new THREE.Vector3(0, 0, 0)),
  scanR: uniform(0),
  /** Front edge visibility (0 outside a transform; pulsed by the clock). */
  rim: uniform(0),
  rimColor: uniform(new THREE.Color(0x9fe8f6)),
});

/**
 * Per-fragment world blend: 0 = current world, 1 = target world (inside the
 * front). scanR = 0 leaves everything at 0.
 *
 * Eine WIPE ändert Farbe entlang einer Linie; eine REKONSTRUKTION ist Materie
 * mit unebener Kante (AD-Review). Deshalb:
 *   – Anisotropie: der Radius wobbelt mit dem Azimut (zwei Sinusse, Amplitude
 *     deutlich unter der Bandbreite — trap #7), die Front ist nie ein Zirkel.
 *   – Bänder wachsen mit dem Radius, sonst dünnt die Kante beim Expandieren
 *     zur Haarlinie aus.
 *   – preGlow: die Front wirft Licht ~1 Band VORAUS auf die alte Welt — die
 *     Veränderung ist verursacht, nicht gestempelt.
 */
const buildScanReads = (sig) => {
  const rel = positionWorld.sub(sig.scanOrigin).toConst("scanRel");
  const az = atan(rel.y, rel.x).toConst("scanAz");
  const wobble = az
    .mul(3)
    .add(1.7)
    .sin()
    .mul(0.11)
    .add(az.mul(5).sin().mul(0.06))
    .mul(sig.scanR.mul(0.4).clamp(0, 1))
    .toConst("scanWobble");
  const scanD = rel.length().add(wobble).toConst("scanD");

  const band = float(0.35).add(sig.scanR.mul(0.1)).toConst("scanBand");
  const scanSig = float(1)
    .sub(smoothstep(sig.scanR.sub(band), sig.scanR, scanD))
    .toConst("scanSig");
  const rimBand = smoothstep(sig.scanR.sub(band.mul(1.4)), sig.scanR.sub(band.mul(0.45)), scanD)
    .mul(float(1).sub(smoothstep(sig.scanR.sub(band.mul(0.45)), sig.scanR.add(band.mul(0.15)), scanD)))
    .mul(sig.rim)
    .toConst("scanRimBand");
  const preGlow = smoothstep(sig.scanR.add(band.mul(2.2)), sig.scanR.add(band.mul(0.2)), scanD)
    .mul(float(1).sub(scanSig))
    .mul(sig.rim)
    .toConst("scanPreGlow");
  return { scanSig, rimBand, preGlow };
};

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

const createLiquidFloor = (sig, backdropOpacity) => {
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

    const { scanSig, rimBand, preGlow } = buildScanReads(sig);
    const graphite = mix(sig.floorBase, sig.floorBaseTo, scanSig);
    const silver = mix(sig.floorReflection, sig.floorReflectionTo, scanSig);
    const cyan = mix(sig.floorSheen, sig.floorSheenTo, scanSig);

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
      // Die Front wirft ihr Licht voraus auf die alte Fläche, dann die Kante.
      .add(sig.rimColor.mul(preGlow.mul(0.14)))
      .add(sig.rimColor.mul(rimBand.mul(0.55)))
      .add(hash);
  })();

  // The liquid dissolves at its bounds instead of ending as a cut slab. On
  // OBSIDIAN this was invisible (black fading over black); a bright world
  // shows the plane's actual edges, so the fade has to live in the alpha.
  material.opacityNode = Fn(() => {
    const p = positionLocal.xy.toVar("floorAlphaP");
    const fade = float(1)
      .sub(smoothstep(float(0.62), float(1.0), p.x.abs()))
      .mul(float(1).sub(smoothstep(float(0.7), float(1.02), p.y.abs())))
      .clamp(0, 1);
    return fade.mul(0.78).mul(backdropOpacity);
  })();

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.frustumCulled = false;
  mesh.renderOrder = -990;
  return mesh;
};

export function createLenoxBackdrop() {
  const signature = createSignatureUniforms();
  const uniforms = {
    /** Light direction, driven by the pointer. Angle only — never intensity. */
    light: uniform(new THREE.Vector3(0.35, 0.4, 1)),
    /** Half-extents of the panel in world units (from the camera frustum). */
    extent: uniform(new THREE.Vector2(3, 3)),
    /** Lenox' position on the panel; the surface stays darkest there. */
    center: uniform(new THREE.Vector2(0, 0)),
    /** How deep the pool behind him is. */
    depth: uniform(0.62),
    /** Composite contribution over authored DOM worlds such as GRAVITY Reef. */
    opacity: uniform(1),
    ...signature,
  };

  const material = new THREE.MeshBasicNodeMaterial({
    toneMapped: false,
    transparent: true,
    depthWrite: true,
    /**
     * DoubleSide, and it is load-bearing: the camera views the sim from -z,
     * so it looks at this plane's BACK face. As FrontSide the panel was
     * silently culled since the day it was written — invisible black in
     * front of visible black, so nobody could tell. ALABASTER made the void
     * behind it ivory, and the missing panel finally had a colour.
     */
    side: THREE.DoubleSide,
  });

  material.colorNode = Fn(() => {
    const p = positionLocal.xy.mul(uniforms.extent).toVar("bdP");

    // Die Rekonstruktionskante ist eine DRUCKWELLE im Lack, kein Leuchtstrich:
    // sie kippt die Oberflächen-Normale entlang der Front (Linseneffekt auf
    // die Reflexionen) — berechnet VOR der Beleuchtung, damit Spec und
    // Fresnel physisch reagieren statt übermalt zu werden.
    const scan = buildScanReads(signature);

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

    // Druckwellen-Verkippung: radial von der Front weg, Stärke = Kantenband.
    const rimTilt = scan.rimBand.mul(0.55).toConst("bdRimTilt");
    const relN = positionWorld.sub(signature.scanOrigin).toConst("bdRelN");
    const relLen = relN.length().max(0.001).toConst("bdRelLen");
    const n = normalize(
      vec3(
        dhdx.negate().add(relN.x.div(relLen).mul(rimTilt)),
        dhdy.negate().add(relN.y.div(relLen).mul(rimTilt)),
        float(1),
      ),
    ).toConst("bdNormal");

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

    const lacquer = mix(signature.panelLacquer, signature.panelLacquerTo, scan.scanSig);
    const navy = mix(
      signature.panelReflection,
      signature.panelReflectionTo,
      scan.scanSig,
    );
    const silver = mix(
      signature.panelSpecular,
      signature.panelSpecularTo,
      scan.scanSig,
    );

    const color = lacquer
      .add(navy.mul(wash.add(fresnel.mul(0.35))))
      .add(silver.mul(spec))
      .mul(pool)
      // Vorauslicht auf der alten Welt, dann die Kante selbst — die Welle
      // hat die Reflexionen schon über die Normale verbogen.
      .add(signature.rimColor.mul(scan.preGlow.mul(0.1)))
      .add(signature.rimColor.mul(scan.rimBand.mul(0.5)))
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
  material.opacityNode = uniforms.opacity;

  const object = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  object.add(mesh);

  const floor = createLiquidFloor(signature, uniforms.opacity);
  const dust = createSilverDust();
  object.add(floor, dust);

  /** panel* / floor* palette keys → the matching uniform pair. */
  const paletteMap = [
    ["panel", "lacquer", "panelLacquer"],
    ["panel", "reflection", "panelReflection"],
    ["panel", "specular", "panelSpecular"],
    ["floor", "base", "floorBase"],
    ["floor", "reflection", "floorReflection"],
    ["floor", "sheen", "floorSheen"],
  ];
  const writePalette = (palette, suffix) => {
    for (const [group, key, name] of paletteMap) {
      const hex = palette?.[group]?.[key];
      if (hex !== undefined) uniforms[name + suffix].value.setHex(hex);
    }
  };

  return {
    object,
    mesh,
    floor,
    dust,
    uniforms,
    /** Instant world (boot / reduced motion): current AND target. */
    setSignature(palette) {
      writePalette(palette, "");
      writePalette(palette, "To");
      uniforms.scanR.value = 0;
      uniforms.rim.value = 0;
    },
    /** Arm the world behind the front. */
    setSignatureTarget(palette) {
      writePalette(palette, "To");
      if (palette?.rim !== undefined) uniforms.rimColor.value.setHex(palette.rim);
    },
    /** Drive the front (world units) and its edge visibility. */
    setScan(radius, rim) {
      uniforms.scanR.value = Math.max(radius, 0);
      uniforms.rim.value = Math.max(Math.min(rim ?? 0, 1), 0);
    },
    setOpacity(opacity) {
      const clamped = Math.max(0, Math.min(Number.isFinite(opacity) ? opacity : 1, 1));
      uniforms.opacity.value = clamped;
      dust.material.opacity = 0.22 * clamped;
    },
    /** The target world becomes the world. */
    commitSignature() {
      for (const [, , name] of paletteMap) {
        uniforms[name].value.copy(uniforms[name + "To"].value);
      }
      uniforms.scanR.value = 0;
      uniforms.rim.value = 0;
    },
    configure({ center, panelZ, halfW, halfH, aspect }) {
      mesh.position.set(center.x, center.y, panelZ);
      mesh.scale.set(halfW, halfH, 1);
      uniforms.extent.value.set(halfW, halfH);
      // The reconstruction front radiates from him.
      uniforms.scanOrigin.value.copy(center);

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
