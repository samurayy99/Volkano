import * as THREE from "three/webgpu";
import { PREENTER_VESSEL } from "../vesselDescriptors.js";
import { maybeLogForensicPostEnter } from "./forensicPostEnter.js";

/**
 * Post-enter drive for the current A2 arrest proof.
 *
 * Active runtime truth:
 * - This module owns only `impact -> compress -> hold`.
 * - Late claim / cleanup / handoff progression is intentionally inactive here.
 * - The simulator owns the authored `V` acquire + commit.
 *
 * `runtime.speed` still scales MLS integration timestep (`dt ∝ speed`) and must
 * not ramp to 0 during post-enter. `POST_ENTER_SLOWDOWN` remains a solver-side
 * damping window only.
 */

export const POST_ENTER_IMPACT = 0.16;
/** Cinematic slow gather into the authored hero body — visible "pulling together". */
export const POST_ENTER_HERO_ACQUIRE = 1.6;
/** Public `compress` stage spans the short hero acquire beat. */
export const POST_ENTER_COMPRESS = POST_ENTER_HERO_ACQUIRE;
export const POST_ENTER_COOL = 0.58;
/** Surrender field window (after hold); must exceed `SETTLE_WEIGHT_RAMP_SEC + SETTLE_HOLD_SEC`. */
export const POST_ENTER_IMPACT_FREEZE = 0.62;
export const POST_ENTER_FREEZE_SPACE_FRAC = 0.26;
export const POST_ENTER_SLOWDOWN = 0.95;
/** Hold after acquire, before renderer-owned withdraw/clear. */
export const POST_ENTER_HOLD = 0.45;
/** Freeze ramp after solver lock. */
export const POST_ENTER_FREEZE_RAMP = 0.52;
/** Brief hold before the freeze ramp starts. */
export const POST_ENTER_FREEZE_HOLD_DELAY = 0.18;

/** Shell claim ramp starts this far through the freeze ramp (after solver lock). */
export const SHELL_CLAIM_RAMP_START_FRAC = 0.35;
/** Wall-clock duration for `shellClaimT` 0→1 once ramp starts. */
export const SHELL_CLAIM_RAMP_SEC = 0.72;

/** Cut MLS source radii to 0 quickly at post-enter start (existing particles only). */
export const SOURCE_RADIUS_CUT_SEC = 0.22;

export const BODY_SCALE_COMPRESSED = 0.92;

// Parked for Pass B: late claim / cleanup / handoff constants are intentionally
// not part of the active A2 arrest-proof path.
export const POST_ENTER_WITHDRAW = 4.0;
export const POST_ENTER_QUIET = 0.72;
export const POST_ENTER_PUSH_IN = 1.1;
export const POST_ENTER_PAGE_LOCK = 0.3;
export const POST_ENTER_HERO = 0.55;
export const POST_ENTER_EXTRACT = 2.0;
export const POST_ENTER_EXTRACT_HOLD = 0.25;
export const SETTLE_WEIGHT_RAMP_SEC = 1.15;
export const SETTLE_HOLD_SEC = 0.12;
export const HOLD_FIELD_SETTLE_SEC = 0.16;
export const WITHDRAW_CHANNEL_WINDOWS = Object.freeze({
  opacity: { start: 0.18, span: 0.46 },
  thin: { start: 0.44, span: 0.3 },
  scale: { start: 0.52, span: 0.26 },
});
export const AUTHORITY_MIX_WEIGHTS = Object.freeze({
  cool: 0.22,
  opacity: 0.08,
  hold: 0.14,
});
export const POST_ENTER_HOLD_PUSH_FRAC = 0.32;
export const WITHDRAWAL_DONE_COMPRESS_MIN = 0.96;
export const WITHDRAWAL_DONE_COOL_MIN = 0.92;
export const WITHDRAWAL_DONE_BODY_MIN = 0.97;
export const PUSH_IN_DISTANCE = 0.12;
export const AUTHORITY_EXPOSURE_LIFT = 0.05;

/** Locked hero hold: heavy, quiet bilobal read (no feed; early gather, then lock). */
const FIELD_HOLD_MUL = Object.freeze({
  noise: 0,
  maxVelocity: 0.2,
  apicBlend: 0.18,
  dynamicViscosity: 15,
  /** Slow-mo gather — particles visibly drift into the central mass. */
  speed: 0.12,
  stiffness: 1.36,
  gravity: 0,
});

const FIELD_KEYS = /** @type {const} */ ([
  "noise",
  "maxVelocity",
  "apicBlend",
  "dynamicViscosity",
  "speed",
  "stiffness",
  // gravity handled separately — its ramp must be ~10× faster than compressDur
]);

export const POST_ENTER_PUSH_IN_COMPLETE_T = 0.9;
export const POST_ENTER_PAGE_LOCK_COMPLETE_T = 1.0;

/** Authority lerp targets (exposure / bloom only). */
export const POST_ENTER_COOLED_LOOK = Object.freeze({
  exposure: 0.48,
  bloomStrength: 0.1,
});

/** Impact overlay on the back plate (first ~200ms wall-clock of post-enter). */
export const ARREST_FLASH_DURATION = 0.18;
export const ARREST_EXPOSURE_PEAK = 0.12;
export const ARREST_EXPOSURE_DIP = -0.04;
/** Additive bloom pulse amplitude (`bloomMult = 1 + spike * gauss(...)`). */
export const ARREST_BLOOM_SPIKE = 0.32;
export const ARREST_RIFT_BOOST = 0.18;

/**
 * Chamber axis-aligned bounds in MLS simulation space.
 *
 * @param {THREE.Object3D | null | undefined} _particleGroup reserved for world-frame alignment
 * @param {typeof PREENTER_VESSEL} vessel
 * @param {{ worldPointToSimulation: (w: THREE.Vector3, t?: THREE.Vector3) => THREE.Vector3 }} particleRenderer
 */
export function buildPostEnterSpatialBasis(
  _particleGroup,
  vessel,
  particleRenderer,
) {
  if (!particleRenderer?.worldPointToSimulation) {
    return null;
  }

  const {
    apertureWidth,
    apertureHeight,
    frameSide,
    frameTop,
    depth,
    centerX,
    centerY,
    centerZ,
  } = vessel;

  const halfW = (apertureWidth + frameSide * 2) * 0.5;
  const halfH = (apertureHeight + frameTop * 2) * 0.5;
  const halfD = depth * 0.5;

  const signs = [-1, 1];
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const world = new THREE.Vector3();
  const sim = new THREE.Vector3();

  for (const sx of signs) {
    for (const sy of signs) {
      for (const sz of signs) {
        world.set(
          centerX + sx * halfW,
          centerY + sy * halfH,
          centerZ + sz * halfD,
        );
        particleRenderer.worldPointToSimulation(world, sim);
        min.min(sim);
        max.max(sim);
      }
    }
  }

  if (
    !Number.isFinite(min.x) ||
    !Number.isFinite(max.x) ||
    min.x >= max.x ||
    min.y >= max.y ||
    min.z >= max.z
  ) {
    return null;
  }

  return {
    chamberBoundsSim: {
      min: min.clone(),
      max: max.clone(),
    },
  };
}

/**
 * @param {import("../mls-mpm/particleRenderer.js").default | null | undefined} particleRenderer
 * @returns {null | { chamberBoundsSim: { min: THREE.Vector3; max: THREE.Vector3 }; freezeSpaceSim: { center: THREE.Vector3; boundsMin: THREE.Vector3; boundsMax: THREE.Vector3 } }}
 */
export function buildPostEnterFreezeSpaceContext(particleRenderer) {
  if (!particleRenderer?.object) {
    return null;
  }

  const basis = buildPostEnterSpatialBasis(
    particleRenderer.object,
    PREENTER_VESSEL,
    particleRenderer,
  );

  if (!basis?.chamberBoundsSim?.min || !basis?.chamberBoundsSim?.max) {
    return null;
  }

  const cmin = basis.chamberBoundsSim.min;
  const cmax = basis.chamberBoundsSim.max;

  const freezeCenter = new THREE.Vector3()
    .addVectors(cmin, cmax)
    .multiplyScalar(0.5);

  const freezeHalf = new THREE.Vector3()
    .subVectors(cmax, cmin)
    .multiplyScalar(0.5 * POST_ENTER_FREEZE_SPACE_FRAC);

  const freezeBoundsMin = new THREE.Vector3()
    .copy(freezeCenter)
    .sub(freezeHalf);

  const freezeBoundsMax = new THREE.Vector3()
    .copy(freezeCenter)
    .add(freezeHalf);

  return {
    chamberBoundsSim: {
      min: cmin.clone(),
      max: cmax.clone(),
    },
    freezeSpaceSim: {
      center: freezeCenter,
      boundsMin: freezeBoundsMin,
      boundsMax: freezeBoundsMax,
    },
  };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth01 = (x) => THREE.MathUtils.smootherstep(clamp01(x), 0, 1);

function calculatePhaseState(app, elapsedSec) {
  const dt = Math.max(0, elapsedSec - app.lastPostEnterElapsed);
  app.lastPostEnterElapsed = elapsedSec;

  const impactEnd = POST_ENTER_IMPACT;
  const heroAcquireStart = impactEnd;
  const heroAcquireEnd = heroAcquireStart + POST_ENTER_HERO_ACQUIRE;
  const compressEnd = heroAcquireEnd;
  const withdrawStart = compressEnd + POST_ENTER_HOLD;

  const compressLocal = clamp01(
    (elapsedSec - impactEnd) / POST_ENTER_COMPRESS,
  );
  const holdLocal = clamp01((elapsedSec - compressEnd) / POST_ENTER_HOLD);

  const heroAcquireT = smooth01(Math.pow(compressLocal, 1.45));
  const holdT = smooth01(holdLocal);

  return {
    dt,
    impactEnd,
    compressEnd,
    heroAcquireStart,
    heroAcquireEnd,
    withdrawStart,
    heroAcquireT,
    holdT,
  };
}

function applySolverChannels(app, rt, f, elapsedSec, fieldBaseline, phase) {
  rt.convergenceSlowdown = 0;

  // Impact is brief and mostly visual; from hero acquire onward the solver moves directly
  // into the heavy hold regime so the explicit hero-body spring owns the visible shape.
  for (const k of FIELD_KEYS) {
    if (elapsedSec < phase.impactEnd) {
      rt[k] = fieldBaseline[k];
    } else {
      rt[k] = fieldBaseline[k] * FIELD_HOLD_MUL[k];
    }
  }

  // Gravity: fast-kill in the impact window (POST_ENTER_IMPACT = 0.16s), then held at 0
  // for the rest of post-enter. Clearing is renderer-owned (opacityT), not physics-owned —
  // gravity must not re-activate during withdraw or the held body collapses to the floor.
  if (elapsedSec < POST_ENTER_IMPACT) {
    rt.gravity =
      fieldBaseline.gravity *
      (1.0 - smooth01(clamp01(elapsedSec / POST_ENTER_IMPACT)));
  } else {
    rt.gravity = 0;
  }

  const srcCutT = smooth01(clamp01(elapsedSec / SOURCE_RADIUS_CUT_SEC));
  rt.postEnterSourceRadiusMul = THREE.MathUtils.lerp(1, 0, srcCutT);

  rt.settleWeight = 0;
  rt.heroBodyWeight = 0;
  rt.authoredDirectionWeight = 0;
  rt.returnBodyWeight = 0;
  rt.recallLateralWeight = 0;
  rt.recallVerticalWeight = 0;
  rt.settleDissolveUnlocked = 0;

  rt.heroBodyWeight =
    elapsedSec < phase.withdrawStart
      ? THREE.MathUtils.lerp(0, 0.9, phase.heroAcquireT)
      : 0;
  rt.authoredDirectionWeight = phase.heroAcquireT;

  const shouldAttemptFreezeCapture = elapsedSec >= phase.heroAcquireEnd;

  if (shouldAttemptFreezeCapture && !f.freezeSnapshotReady) {
    app.ensurePostEnterFreezeSnapshot();
  }

  const shouldLock =
    shouldAttemptFreezeCapture &&
    f.freezeSnapshotReady &&
    elapsedSec >= phase.withdrawStart;
  if (shouldLock && app.postEnterSolverLockTime === null) {
    app.mlsMpmSim?.scheduleHeroBodyCommit?.();
    app.postEnterSolverLockTime = elapsedSec;
  }
  f.solverLocked = shouldLock;
  rt.solverLocked = shouldLock;

  // Freeze starts only after solver lock is active and briefly held.
  if (shouldLock) {
    const freezeLockStart = app.postEnterSolverLockTime ?? elapsedSec;
    const freezeRampStart = freezeLockStart + POST_ENTER_FREEZE_HOLD_DELAY;
    const freezeRampSpan = Math.max(0.0001, POST_ENTER_FREEZE_RAMP);
    rt.convergenceFreeze =
      elapsedSec < freezeRampStart
        ? 0
        : smooth01(clamp01((elapsedSec - freezeRampStart) / freezeRampSpan));
  } else {
    rt.convergenceFreeze = 0;
  }

  rt.particleSurrenderT = 0;

  let shellClaimT = 0;
  if (shouldLock) {
    const freezeLockStart = app.postEnterSolverLockTime ?? elapsedSec;
    const freezeRampStart = freezeLockStart + POST_ENTER_FREEZE_HOLD_DELAY;
    const shellRampStart =
      freezeRampStart + POST_ENTER_FREEZE_RAMP * SHELL_CLAIM_RAMP_START_FRAC;
    if (elapsedSec >= shellRampStart) {
      shellClaimT = smooth01(
        clamp01((elapsedSec - shellRampStart) / SHELL_CLAIM_RAMP_SEC),
      );
    }
  }
  rt.shellClaimT = shellClaimT;
}

function applyArrestProofRenderAndFlowChannels(app, elapsedSec, rt, f, phase) {
  const coolNext = rt.solverLocked ? rt.convergenceFreeze : 0;
  rt.compressT = Math.max(rt.compressT, phase.heroAcquireT);
  rt.bodyScaleMul = 1;
  rt.coolT = Math.max(rt.coolT, coolNext);
  rt.withdrawT = 0;
  rt.thinT = 0;
  rt.opacityT = 0;
  rt.extractionT = 0;
  rt.massDimT = 0;
  rt.backBiasT = 0;
  rt.authorityLightT = 0;
  rt.pushInT = 0;
  rt.pageLockT = 0;
  rt.heroT = 0;

  f.withdrawalDone = false;
  app.quietElapsed = 0;
  f.quietLocked = false;
  f.cameraArrived = false;
  f.pageLocked = false;
  f.heroAllowed = false;
  app.pushInStartTime = null;
  app.pageLockStartTime = null;
  app.heroStartTime = null;

  app.updateCamera(0);
  app.updateAuthorityLight(0, 0);
  app.updateArrestFlash(elapsedSec);
}

function resolveArrestProofStage(elapsedSec, phase) {
  if (elapsedSec < phase.impactEnd) {
    return "impact";
  }
  if (elapsedSec < phase.compressEnd) {
    return "compress";
  }
  return "hold";
}

/**
 * @param {object} app
 * @param {number} elapsedSec
 * @param {{
 *   noise: number;
 *   speed: number;
 *   gravity: number;
 *   stiffness: number;
 *   dynamicViscosity: number;
 *   apicBlend: number;
 *   maxVelocity: number;
 * }} fieldBaseline idle MLS scalars (same source as `BASE_RUNTIME_DEFAULTS`) for Field Dominance.
 * @returns {"none"|"impact"|"compress"|"hold"|"withdraw"|"quiet"|"push_in"|"page_lock"|"hero"}
 */
export function runPostEnterDrive(app, elapsedSec, fieldBaseline) {
  if (!app.runtime) {
    app._lastPostEnterStageReturned = "none";
    return "none";
  }

  if (!app.postEnterDriveActive) {
    app.runtime.shellClaimT = 0;
    app.runtime.particleSurrenderT = 0;
    app._lastPostEnterStageReturned = "none";
    return "none";
  }

  const rt = app.runtime;
  const f = app.postEnterFlags;

  const phase = calculatePhaseState(app, elapsedSec);

  applySolverChannels(app, rt, f, elapsedSec, fieldBaseline, phase);
  applyArrestProofRenderAndFlowChannels(app, elapsedSec, rt, f, phase);

  maybeLogForensicPostEnter(app, elapsedSec, rt);
  const stage = resolveArrestProofStage(elapsedSec, phase);

  app._lastPostEnterStageReturned = stage;
  app._lastDrivePostEnterElapsed = elapsedSec;

  return stage;
}
