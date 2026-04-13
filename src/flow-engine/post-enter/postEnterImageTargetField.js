/**
 * M1: single-image threshold sampling → 3D target positions in chamber sim space with shallow relief.
 * Plain JS; no director / MLS coupling.
 */

export const POST_ENTER_APPARITION_IMAGE_URL =
  "/images/post-enter/volkano-apparition-source-v1.png";

const DEFAULT_MAX_POINTS = 6000;
const DEFAULT_LUMINANCE_THRESHOLD = 0.42;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * @param {HTMLImageElement} image
 * @param {{ min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }} chamberBoundsSim
 * @param {number} planeZ
 * @param {{ x: number; y: number; z: number }} normal
 * @param {number} reliefMax
 * @param {number} maxPoints
 * @param {number} luminanceThreshold
 * @param {boolean} [keepBrightStrokes] — if true, keep pixels with luma **above** threshold (light ink on dark).
 */
function sampleTargetsFromImage(
  image,
  chamberBoundsSim,
  planeZ,
  normal,
  reliefMax,
  maxPoints,
  luminanceThreshold,
  keepBrightStrokes = false,
) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (w <= 0 || h <= 0) {
    return {
      count: 0,
      positions: new Float32Array(0),
      reliefWeights: new Float32Array(0),
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      count: 0,
      positions: new Float32Array(0),
      reliefWeights: new Float32Array(0),
    };
  }
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);

  const cmin = chamberBoundsSim.min;
  const cmax = chamberBoundsSim.max;
  const nx = normal.x;
  const ny = normal.y;
  const nz = normal.z;

  /** @type {number[]} */
  const xs = [];
  /** @type {number[]} */
  const ys = [];
  /** @type {number[]} */
  const lumas = [];

  for (let iy = 0; iy < h; iy += 1) {
    for (let ix = 0; ix < w; ix += 1) {
      const i = (iy * w + ix) * 4;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const a = data[i + 3] / 255;
      if (a < 0.08) continue;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (keepBrightStrokes) {
        if (luma < luminanceThreshold) continue;
      } else if (luma > luminanceThreshold) {
        continue;
      }

      xs.push(ix);
      ys.push(iy);
      lumas.push(luma);
    }
  }

  const nActive = xs.length;
  if (nActive === 0) {
    return {
      count: 0,
      positions: new Float32Array(0),
      reliefWeights: new Float32Array(0),
    };
  }

  const stride = Math.max(1, Math.ceil(nActive / maxPoints));
  const count = Math.ceil(nActive / stride);
  const positions = new Float32Array(count * 3);
  const reliefWeights = new Float32Array(count);

  let out = 0;
  for (let k = 0; k < nActive; k += stride) {
    const ix = xs[k];
    const iy = ys[k];
    const luma = lumas[k];
    const u = (ix + 0.5) / w;
    const v = (iy + 0.5) / h;

    const x = cmin.x + u * (cmax.x - cmin.x);
    const y = cmax.y - v * (cmax.y - cmin.y);

    const ink = keepBrightStrokes ? luma : 1 - luma;
    const relief = reliefMax * (0.15 + 0.85 * ink);

    const px = x + nx * relief;
    const py = y + ny * relief;
    const pz = planeZ + nz * relief;

    positions[out * 3] = px;
    positions[out * 3 + 1] = py;
    positions[out * 3 + 2] = pz;
    reliefWeights[out] = ink;
    out += 1;
  }

  return {
    count: out,
    positions: out === count ? positions : positions.slice(0, out * 3),
    reliefWeights: out === count ? reliefWeights : reliefWeights.slice(0, out),
  };
}

/**
 * @param {object} options
 * @param {string} [options.imageUrl]
 * @param {{ min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }} options.chamberBoundsSim
 * @param {{ planeZ: number; normal: { x: number; y: number; z: number }; reliefMax: number }} options.apparitionPlacementSim
 * @param {number} [options.maxPoints]
 * @param {number} [options.luminanceThreshold]
 * @param {boolean} [options.keepBrightStrokes]
 * @returns {Promise<{ count: number; positions: Float32Array; reliefWeights: Float32Array; imageUrl: string }>}
 */
export async function buildPostEnterImageTargetField(options = {}) {
  const imageUrl = options.imageUrl ?? POST_ENTER_APPARITION_IMAGE_URL;
  const { chamberBoundsSim, apparitionPlacementSim } = options;
  if (!chamberBoundsSim?.min || !chamberBoundsSim?.max) {
    throw new Error("buildPostEnterImageTargetField: chamberBoundsSim required");
  }
  if (!apparitionPlacementSim) {
    throw new Error("buildPostEnterImageTargetField: apparitionPlacementSim required");
  }

  const maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;
  const luminanceThreshold =
    options.luminanceThreshold ?? DEFAULT_LUMINANCE_THRESHOLD;
  const keepBrightStrokes = options.keepBrightStrokes ?? false;

  const image = await loadImage(imageUrl);
  let sampled = sampleTargetsFromImage(
    image,
    chamberBoundsSim,
    apparitionPlacementSim.planeZ,
    apparitionPlacementSim.normal,
    apparitionPlacementSim.reliefMax,
    maxPoints,
    luminanceThreshold,
    keepBrightStrokes,
  );

  if (sampled.count === 0 && !keepBrightStrokes) {
    sampled = sampleTargetsFromImage(
      image,
      chamberBoundsSim,
      apparitionPlacementSim.planeZ,
      apparitionPlacementSim.normal,
      apparitionPlacementSim.reliefMax,
      maxPoints,
      0.38,
      true,
    );
  }

  return {
    count: sampled.count,
    positions: sampled.positions,
    reliefWeights: sampled.reliefWeights,
    imageUrl,
  };
}
