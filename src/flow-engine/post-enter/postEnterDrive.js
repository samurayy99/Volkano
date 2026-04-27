import * as THREE from "three/webgpu";
import { maybeLogForensicPostEnter } from "./forensicPostEnter.js";

export const POST_ENTER_IMPACT = 0.08;

/**
 * First beat: let the existing MLS state lose energy under controlled runtime
 * instead of switching to a fake post-enter arrest kernel.
 */
export const POST_ENTER_SETTLE_END = 2.2;
export const POST_ENTER_RIFT_FLIGHT_START = 2.5;
export const POST_ENTER_RIFT_FLIGHT_DURATION = 6.0;

/** Cut MLS source radii to 0 quickly at post-enter start (existing particles only). */
export const SOURCE_RADIUS_CUT_SEC = 0.22;
export const PUSH_IN_DISTANCE = 0.12;
export const AUTHORITY_EXPOSURE_LIFT = 0.05;

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
 * First-beat MLS slowdown profile.
 * These are multipliers against the source-play baseline, not absolute values.
 * Keep speed non-zero: speed scales solver dt, so near-zero speed reads as a freeze.
 */
const FIELD_HOLD_MUL = Object.freeze({
  noise: 0,
  maxVelocity: 0.2,
  apicBlend: 0.18,
  dynamicViscosity: 15,
  speed: 0.12,
  stiffness: 1.36,
  gravity: 0,
});

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth01 = (x) => THREE.MathUtils.smootherstep(clamp01(x), 0, 1);

/**
 * Material claim: staged materialClaimT so renderer eases in without
 * snapping the whole rod carpet. thermalExtinction still leads compute cooling.
 */
const EXTINCTION_FAST_SEC = 0.3;
const EXTINCTION_FAST_TARGET = 0.0;
const EXTINCTION_HOLD_TARGET = 0.0;
const MATERIAL_CLAIM_DELAY_SEC = 0.08;

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
 * @returns {"none"|"impact"|"riftFlight"|"riftComplete"}
 */
export function runPostEnterDrive(app, elapsedSec, fieldBaseline) {
  if (!app.runtime || !app.postEnterDriveActive) {
    app._lastPostEnterStageReturned = "none";
    return "none";
  }

  const rt = app.runtime;

  rt.run = false;
  rt.solverLocked = false;
  rt.bodyScaleMul = 1;
  rt.postEnterArrestActive = false;
  rt.postEnterArrestT = 0;
  rt.postEnterHoldT = 0;
  rt.postEnterRiftFlightActive = false;
  rt.postEnterFlightSec = 0;
  rt.postEnterFlightT = 0;
  rt.authorityLightT = 0;
  rt.pushInT = 0;
  rt.pageLockT = 0;
  rt.heroT = 0;

  rt.noise = fieldBaseline.noise;
  rt.maxVelocity = fieldBaseline.maxVelocity;
  rt.apicBlend = fieldBaseline.apicBlend;
  rt.dynamicViscosity = fieldBaseline.dynamicViscosity;
  rt.speed = fieldBaseline.speed;
  rt.stiffness = fieldBaseline.stiffness;

  if (elapsedSec < POST_ENTER_IMPACT) {
    rt.gravity =
      fieldBaseline.gravity *
      (1.0 - smooth01(clamp01(elapsedSec / POST_ENTER_IMPACT)));
  } else {
    rt.gravity = 0;
  }

  const srcCutT = smooth01(clamp01(elapsedSec / SOURCE_RADIUS_CUT_SEC));
  rt.postEnterSourceRadiusMul = THREE.MathUtils.lerp(1, 0, srcCutT);

  if (elapsedSec < POST_ENTER_RIFT_FLIGHT_START) {
    const settleT = smooth01(elapsedSec / POST_ENTER_SETTLE_END);
    const holdT =
      elapsedSec < POST_ENTER_SETTLE_END
        ? 0
        : smooth01(
            (elapsedSec - POST_ENTER_SETTLE_END) /
              (POST_ENTER_RIFT_FLIGHT_START - POST_ENTER_SETTLE_END),
          );

    /**
     * Keep real MLS alive for the first beat.
     * Do not use the fake arrest kernel for cinematic slowdown.
     */
    rt.run = true;
    rt.solverLocked = false;
    rt.postEnterArrestActive = false;
    rt.postEnterArrestT = settleT;
    rt.postEnterHoldT = holdT;
    rt.postEnterRiftFlightActive = false;
    rt.postEnterFlightSec = 0;
    rt.postEnterFlightT = 0;

    const profileT = Math.max(settleT, holdT);

    rt.gravity = THREE.MathUtils.lerp(
      fieldBaseline.gravity,
      fieldBaseline.gravity * FIELD_HOLD_MUL.gravity,
      profileT,
    );

    rt.noise = THREE.MathUtils.lerp(
      fieldBaseline.noise,
      fieldBaseline.noise * FIELD_HOLD_MUL.noise,
      profileT,
    );

    rt.speed = THREE.MathUtils.lerp(
      fieldBaseline.speed,
      fieldBaseline.speed * FIELD_HOLD_MUL.speed,
      profileT,
    );

    rt.maxVelocity = THREE.MathUtils.lerp(
      fieldBaseline.maxVelocity,
      fieldBaseline.maxVelocity * FIELD_HOLD_MUL.maxVelocity,
      profileT,
    );

    rt.dynamicViscosity = THREE.MathUtils.lerp(
      fieldBaseline.dynamicViscosity,
      fieldBaseline.dynamicViscosity * FIELD_HOLD_MUL.dynamicViscosity,
      profileT,
    );

    rt.apicBlend = THREE.MathUtils.lerp(
      fieldBaseline.apicBlend,
      fieldBaseline.apicBlend * FIELD_HOLD_MUL.apicBlend,
      profileT,
    );

    rt.stiffness = THREE.MathUtils.lerp(
      fieldBaseline.stiffness,
      fieldBaseline.stiffness * FIELD_HOLD_MUL.stiffness,
      profileT,
    );

    /**
     * Do not overuse convergenceSlowdown here.
     * The old better read came from live MLS + viscosity/speed profile, not XSPH freeze.
     */
    rt.convergenceSlowdown = 0;
    rt.convergenceFreeze = 0;
    rt.convergenceHeatRetention = 0;

    /**
     * Material Claim: front-loaded thermal extinction cools compute colors
     * before the renderer mineral read dominates.
     *
     * thermalExtinction: 0 → EXTINCTION_FAST_TARGET over EXTINCTION_FAST_SEC,
     *   then lerp to EXTINCTION_HOLD_TARGET through first-beat end.
     * materialClaimT: 0 through settle+hold (renderer stays on MLS rod read), then flight 0 → 1.
     * postEnterHoverClamp: 0 immediately — kill hover color at source.
     */

    const extinctionFastT = smooth01(clamp01(elapsedSec / EXTINCTION_FAST_SEC));
    if (elapsedSec < EXTINCTION_FAST_SEC) {
      rt.convergenceThermalExtinction = THREE.MathUtils.lerp(
        0,
        EXTINCTION_FAST_TARGET,
        extinctionFastT,
      );
    } else {
      const slowT = smooth01(
        clamp01(
          (elapsedSec - EXTINCTION_FAST_SEC) /
            (POST_ENTER_RIFT_FLIGHT_START - EXTINCTION_FAST_SEC),
        ),
      );
      rt.convergenceThermalExtinction = THREE.MathUtils.lerp(
        EXTINCTION_FAST_TARGET,
        EXTINCTION_HOLD_TARGET,
        slowT,
      );
    }

    // Keep claim at 0 for full settle+hold so rod colors stay stable (thermal lock + no post-enter mix).
    // Flight ramps 0 → 1 instead of jumping to 0.82 so postEnterMaterialT eases in without a one-frame cliff.
    rt.materialClaimT = 0;

    // Freeze sim-authored color/heat during settle+hold; rift flight kernel owns writes once suction starts.
    rt.postEnterThermalColorLock = 1;

    rt.postEnterHoverClamp = 0;

    /**
     * Keep the existing source-radius cut computed above.
     * Do not force postEnterSourceRadiusMul = 0 here.
     */

    app.updateCamera(0);
    app.updateAuthorityLight(0, 0);
    app.updateArrestFlash(elapsedSec);

    maybeLogForensicPostEnter(app, elapsedSec, rt);

    app._lastPostEnterStageReturned = "impact";
    app._lastDrivePostEnterElapsed = elapsedSec;

    return "impact";
  }

  if (elapsedSec >= POST_ENTER_RIFT_FLIGHT_START) {
    if (!app._postEnterRiftFlightInitScheduled) {
      app.mlsMpmSim?.schedulePostEnterRiftFlightInit?.();
      app._postEnterRiftFlightInitScheduled = true;
    }
    const flightSec = Math.max(0, elapsedSec - POST_ENTER_RIFT_FLIGHT_START);
    const flightT = clamp01(flightSec / POST_ENTER_RIFT_FLIGHT_DURATION);
    rt.run = false;
    rt.gravity = 0;
    rt.postEnterSourceRadiusMul = 0;
    rt.postEnterFlightSec = flightSec;
    rt.postEnterFlightT = flightT;
    rt.postEnterRiftFlightActive = flightT < 1;
    rt.solverLocked = flightT >= 1;

    rt.postEnterThermalColorLock = 0;

    rt.convergenceThermalExtinction = EXTINCTION_HOLD_TARGET;
    rt.materialClaimT = THREE.MathUtils.lerp(0, 1.0, flightT);
    rt.postEnterHoverClamp = 0;

    app.updateCamera(0);
    app.updateAuthorityLight(0, 0);
    app.updateArrestFlash(elapsedSec);

    maybeLogForensicPostEnter(app, elapsedSec, rt);

    app._lastPostEnterStageReturned =
      flightT >= 1 ? "riftComplete" : "riftFlight";
    app._lastDrivePostEnterElapsed = elapsedSec;

    return app._lastPostEnterStageReturned;
  }

  app.updateCamera(0);
  app.updateAuthorityLight(0, 0);
  app.updateArrestFlash(elapsedSec);

  maybeLogForensicPostEnter(app, elapsedSec, rt);

  app._lastPostEnterStageReturned = "impact";
  app._lastDrivePostEnterElapsed = elapsedSec;

  return "impact";
}
