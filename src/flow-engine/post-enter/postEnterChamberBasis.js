import * as THREE from "three/webgpu";
import { PREENTER_VESSEL } from "../vesselDescriptors";

const MIN_SEGMENT_LEN = 1e-5;

/** Freeze AABB half-extent as fraction of chamber half-extent (context + idle renderer sync). */
export const POST_ENTER_FREEZE_SPACE_FRAC = 0.9;

/**
 * Spatial contract (post-enter wall / rift in sim space):
 * - chamber AABB in particle local space
 * - **narrow intake rectangle** on the back wall (`riftSlitP0Sim` / `riftSlitP1Sim`, min/max xy).
 *
 * Out of scope here: particle look, dissolve choreography, image-resolve — those live in the
 * director timeline + renderer only.
 */

const RIFT_CENTER_X_FRAC = 0.5;
const RIFT_CENTER_Y_FRAC = 0.5;

/**
 * Half-height as a fraction of chamber height (sim Y span).
 * Total slit height = 2 * this * ySpan (~68% at 0.34).
 */
const RIFT_HALF_HEIGHT_FRAC = 0.34;

/**
 * Half-width as a fraction of chamber width (sim X span). Non-zero width fixes the
 * “1D slit” contract: transport targets the panel; capture can collapse to spine.
 */
const RIFT_HALF_WIDTH_FRAC = 0.042;

/** Optional inset from exact back wall (sim Z); 0 keeps wall-read contract. */
const RIFT_Z_INSET = 0.0;

const _worldCorners = Array.from({ length: 8 }, () => new THREE.Vector3());
const _localCorner = new THREE.Vector3();
/** Internal only: `buildRiftAndExitFromChamberSim` needs an exit point vector; not part of public context. */
const _exitScratchForRift = new THREE.Vector3();

function setChamberWorldCorners(vessel) {
  const x0 = vessel.centerX - vessel.apertureWidth * 0.5;
  const x1 = vessel.centerX + vessel.apertureWidth * 0.5;
  const y0 = vessel.centerY - vessel.apertureHeight * 0.5;
  const y1 = vessel.centerY + vessel.apertureHeight * 0.5;
  const z0 = vessel.centerZ;
  const z1 = vessel.centerZ + vessel.depth;

  _worldCorners[0].set(x0, y0, z0);
  _worldCorners[1].set(x1, y0, z0);
  _worldCorners[2].set(x0, y1, z0);
  _worldCorners[3].set(x1, y1, z0);

  _worldCorners[4].set(x0, y0, z1);
  _worldCorners[5].set(x1, y0, z1);
  _worldCorners[6].set(x0, y1, z1);
  _worldCorners[7].set(x1, y1, z1);
}

/**
 * Chamber AABB in particle simulation space: all eight vessel box corners
 * transformed with `worldToLocal`, then min/max. More robust than two opposite
 * corners when the particle object has rotation or non-uniform scale.
 *
 * @param {THREE.Object3D} object
 * @param {typeof PREENTER_VESSEL} vessel
 * @param {THREE.Vector3} outMin
 * @param {THREE.Vector3} outMax
 */
export function computeChamberBoundsSimFromParticleObject(
  object,
  vessel,
  outMin,
  outMax,
) {
  setChamberWorldCorners(vessel);

  object.updateWorldMatrix(true, false);

  outMin.set(Infinity, Infinity, Infinity);
  outMax.set(-Infinity, -Infinity, -Infinity);

  for (let i = 0; i < _worldCorners.length; i += 1) {
    _localCorner.copy(_worldCorners[i]);
    object.worldToLocal(_localCorner);

    outMin.min(_localCorner);
    outMax.max(_localCorner);
  }
}

/**
 * Exit target at wall fractions; intake **rectangle** on z = zWall:
 * `outP0` = min corner (cx - halfWidth, cy - halfHeight), `outP1` = max corner
 * (cx + halfWidth, cy + halfHeight). Diagonal is not used as motion axis — flight
 * clamps to the axis-aligned panel.
 *
 * @param {THREE.Vector3} chamberMin
 * @param {THREE.Vector3} chamberMax
 * @param {THREE.Vector3} outExit
 * @param {THREE.Vector3} outP0
 * @param {THREE.Vector3} outP1
 * @returns {boolean} false if the rectangle is degenerate
 */
export function buildRiftAndExitFromChamberSim(
  chamberMin,
  chamberMax,
  outExit,
  outP0,
  outP1,
) {
  const xSpan = Math.max(chamberMax.x - chamberMin.x, 1e-6);
  const ySpan = Math.max(chamberMax.y - chamberMin.y, 1e-6);

  const cx = chamberMin.x + xSpan * RIFT_CENTER_X_FRAC;
  const cy = chamberMin.y + ySpan * RIFT_CENTER_Y_FRAC;
  const zWall = chamberMax.z - RIFT_Z_INSET;

  const halfHeight = Math.max(ySpan * RIFT_HALF_HEIGHT_FRAC, MIN_SEGMENT_LEN);
  const halfWidth = Math.max(xSpan * RIFT_HALF_WIDTH_FRAC, MIN_SEGMENT_LEN);

  outExit.set(cx, cy, zWall);
  outP0.set(cx - halfWidth, cy - halfHeight, zWall);
  outP1.set(cx + halfWidth, cy + halfHeight, zWall);

  return halfWidth > MIN_SEGMENT_LEN && halfHeight > MIN_SEGMENT_LEN;
}

/**
 * Spatial slice of PostEnterContext (chamber + rift; no freeze fields).
 *
 * @param {THREE.Object3D | null | undefined} object
 * @param {typeof PREENTER_VESSEL} [vessel]
 * @returns {null | {
 *   chamberBoundsSim: { min: THREE.Vector3; max: THREE.Vector3 };
 *   riftSlitP0Sim: THREE.Vector3;
 *   riftSlitP1Sim: THREE.Vector3;
 * }}
 */
export function buildPostEnterSpatialBasis(
  object,
  vessel = PREENTER_VESSEL,
) {
  if (!object) {
    return null;
  }

  const chamberMin = new THREE.Vector3();
  const chamberMax = new THREE.Vector3();
  computeChamberBoundsSimFromParticleObject(object, vessel, chamberMin, chamberMax);

  if (
    ![
      chamberMin.x,
      chamberMin.y,
      chamberMin.z,
      chamberMax.x,
      chamberMax.y,
      chamberMax.z,
    ].every(Number.isFinite)
  ) {
    return null;
  }

  const riftSlitP0Sim = new THREE.Vector3();
  const riftSlitP1Sim = new THREE.Vector3();

  if (
    !buildRiftAndExitFromChamberSim(
      chamberMin,
      chamberMax,
      _exitScratchForRift,
      riftSlitP0Sim,
      riftSlitP1Sim,
    )
  ) {
    return null;
  }

  return {
    chamberBoundsSim: {
      min: chamberMin.clone(),
      max: chamberMax.clone(),
    },
    riftSlitP0Sim,
    riftSlitP1Sim,
  };
}
