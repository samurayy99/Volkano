import * as THREE from "three/webgpu";

/**
 * THE VOID ENVIRONMENT — what Lenox reflects.
 *
 * He was reflecting `autumn_field_puresky_1k.hdr` — a meadow under a blue sky,
 * left over from the fluid demo this engine grew out of. Every highlight on his
 * shell, every glint in the visor, was a field. That, not the shader, is why his
 * silver never read like machined metal.
 *
 * This is a black studio instead: authored reflection bands around him. You
 * never see them — you only see what they leave on him. That is the whole
 * point, and it is also why the "twenty glowing capsules in a ring" idea
 * belongs in an environment map and not in the scene: as geometry it reads as
 * Tron, as a reflection it reads as light.
 *
 * It is genuinely HDR (float, values well above 1), because a reflection clamped
 * to 1.0 cannot produce a specular highlight — it produces a grey smudge.
 *
 * The rig is authored from the PRODUCT, not from a generic key/fill/rim setup.
 * Ask where the silver band should land — forehead contour, visor frame, side
 * lamella, chin, V-notch — then put a softened card in the environment that
 * produces that band. Peak values stay moderate and the bars stay wide enough
 * that the visor glass cannot collapse them into a white "third eye".
 */

const W = 512;
const H = 256;

/** Near-black room. Linear, not sRGB — this feeds a reflection, not a screen. */
const AMBIENT = 0.0035;
/** A faint wash from above, so the top of his head is not as dead as his chin. */
const CEILING = 0.03;

/**
 * ALABASTER — the bright studio (Signatur-Welt). Same authored-band idea,
 * inverted premise: the room is light, so what sculpts his silver are DARK
 * contour bands plus a warm ceiling. His identity does not change — the same
 * obsidian head simply stands in an ivory room and reflects it.
 */
const ALABASTER_PROFILE = {
  ambient: 0.34,
  ambientTint: [1.0, 0.975, 0.92], // ivory, faintly warm — never neutral grey
  ceiling: 0.5,
  bands: [
    // Dark contour band where the forehead silver used to flare: shape by shadow.
    {
      target: "forehead-contour-dark",
      az: 2.42, el: 0.58, sigmaAz: 0.22, sigmaEl: 0.4,
      intensity: -0.26, tint: [1, 1, 1],
    },
    // Window-like bright card, slightly warm — the editorial key.
    {
      target: "studio-window",
      az: 5.4, el: 0.34, sigmaAz: 0.42, sigmaEl: 0.5,
      intensity: 5.2, tint: [1.0, 0.97, 0.9],
    },
    // Dark floorline all around: grounds the chin, keeps the V-notch readable.
    {
      target: "floorline-dark",
      az: 3.2, el: -0.6, sigmaAz: 2.6, sigmaEl: 0.34,
      intensity: -0.22, tint: [1, 1, 1],
    },
    // Cool side rim so the lamellae still separate from the bright room.
    {
      target: "side-cool",
      az: 0.82, el: 0.16, sigmaAz: 0.24, sigmaEl: 0.5,
      intensity: 1.9, tint: [0.72, 0.86, 0.95],
    },
  ],
};

/**
 * Reflection bands, in radians. `az` runs 0..2π around him; `el` is elevation,
 * 0 at the horizon. These are deliberately broader than real strip softboxes:
 * the goal is a moving studio band on rounded metal, not pinpoint catchlights
 * on smoked glass.
 */
const REFLECTION_BANDS = [
  // Forehead contour: the main silver read across the upper shell.
  {
    target: "forehead-contour",
    az: 2.42,
    el: 0.58,
    sigmaAz: 0.2,
    sigmaEl: 0.38,
    intensity: 12.5,
    tint: [1.0, 0.985, 0.95],
  },
  // Upper visor frame: enough to explain the edge, not enough to spot on glass.
  {
    target: "visor-upper-frame",
    az: 2.9,
    el: 0.18,
    sigmaAz: 0.24,
    sigmaEl: 0.2,
    intensity: 5.8,
    tint: [0.82, 0.91, 0.96],
  },
  // Side lamella and cheek curve: cool edge separation on the shadow side.
  {
    target: "side-lamella",
    az: 0.82,
    el: 0.16,
    sigmaAz: 0.2,
    sigmaEl: 0.54,
    intensity: 6.8,
    tint: [0.68, 0.86, 1.0],
  },
  // Chin and lower V-notch: a low horizontal band that grounds the face.
  {
    target: "chin-v-notch",
    az: 4.08,
    el: -0.42,
    sigmaAz: 0.3,
    sigmaEl: 0.2,
    intensity: 8.4,
    tint: [0.94, 0.97, 1.0],
  },
  // Broad opposite fill: prevents the metal from turning into a cut-out.
  {
    target: "body-fill",
    az: 5.55,
    el: 0.22,
    sigmaAz: 0.58,
    sigmaEl: 0.9,
    intensity: 2.2,
    tint: [0.82, 0.88, 0.96],
  },
  // Cyan trace: his own signal folded back into the room, barely visible.
  {
    target: "signal-return",
    az: 3.2,
    el: -0.32,
    sigmaAz: 0.26,
    sigmaEl: 0.44,
    intensity: 1.15,
    tint: [0.28, 0.8, 1.0],
  },
];

/** Shortest angular distance on a circle — bars must not clip at the seam. */
function wrapDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createVoidEnvironment(profile) {
  const ambient = profile?.ambient ?? AMBIENT;
  const ambientTint = profile?.ambientTint ?? [1, 1, 1.15];
  const ceilingStrength = profile?.ceiling ?? CEILING;
  const bands = profile?.bands ?? REFLECTION_BANDS;

  const data = new Float32Array(W * H * 4);

  for (let y = 0; y < H; y++) {
    // Equirectangular: v=0 is straight up, v=1 straight down.
    const el = Math.PI / 2 - ((y + 0.5) / H) * Math.PI;
    const ceiling = ceilingStrength * Math.max(0, Math.sin(el)) ** 2;

    for (let x = 0; x < W; x++) {
      const az = ((x + 0.5) / W) * Math.PI * 2;

      const base = ambient + ceiling;
      let r = base * ambientTint[0];
      let g = base * ambientTint[1];
      let b = base * ambientTint[2];

      for (const band of bands) {
        const dAz = wrapDelta(az, band.az) / band.sigmaAz;
        const dEl = (el - band.el) / band.sigmaEl;
        const falloff = Math.exp(-(dAz * dAz + dEl * dEl));
        if (falloff < 1e-4) continue;
        // Negative Intensität = dunkles Konturband (ALABASTER formt durch
        // Schatten). Multiplikativ, damit es nie unter Null clippt.
        if (band.intensity < 0) {
          const dim = 1 + band.intensity * falloff;
          r *= dim;
          g *= dim;
          b *= dim;
          continue;
        }
        const v = band.intensity * falloff;
        r += v * band.tint[0];
        g += v * band.tint[1];
        b += v * band.tint[2];
      }

      const i = (y * W + x) * 4;
      data[i] = Math.max(r, 0);
      data[i + 1] = Math.max(g, 0);
      data[i + 2] = Math.max(b, 0);
      data[i + 3] = 1;
    }
  }

  const texture = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** The bright studio for the ALABASTER signature. */
export function createAlabasterEnvironment() {
  return createVoidEnvironment(ALABASTER_PROFILE);
}
