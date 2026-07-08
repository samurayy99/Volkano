/**
 * Source-chamber conversation driver (V2 signal layer).
 *
 * Second runtime author next to `postEnterDrive.js`: the bridge runs exactly
 * one of the two per frame (this one only while no post-enter cycle is
 * active). It writes the same `app.runtime` channels the engine already
 * consumes — no kernel, no shader, no new uniform is introduced here.
 *
 * All motion is expressed as eased approach toward per-state target profiles,
 * so console-driven state switches read as fluid transitions, never pops.
 * The "dormant" profile is numerically identical to plain source play
 * (`sourcePlayEngineRuntime` + all conversation channels at 0).
 */

/** Matches `sourcePlayEngineRuntime()` in engineBridge.ts. */
const SOURCE_PLAY_BASE = Object.freeze({
  gravity: 1,
  noise: 1.08,
  speed: 1.02,
  dynamicViscosity: 0.034,
});

/** Matches app.js `DEFAULT_LOOK` (exposure / bloomStrength only). */
const LOOK_BASE = Object.freeze({
  exposure: 0.56,
  bloomStrength: 0.16,
});

/** Seconds to cover ~63% of the distance to a new state profile. */
const EASE_TAU_SEC = 0.5;

/**
 * Per-state channel targets. `*Mul` scale SOURCE_PLAY_BASE; everything else
 * is an absolute channel value. Tuning lives here and only here.
 */
const PROFILES = Object.freeze({
  dormant: {
    noiseMul: 1,
    speedMul: 1,
    viscosityMul: 1,
    gravityMul: 1,
    convergenceSlowdown: 0,
    convergenceFreeze: 0,
    convergenceHeatRetention: 0,
    convergenceThermalExtinction: 0,
    settleWeight: 0,
    recallLateralWeight: 0,
    recallVerticalWeight: 0,
    compressT: 0,
    thinT: 0,
    massDimT: 0,
    materialClaimT: 0,
    exposure: LOOK_BASE.exposure,
    bloomStrength: LOOK_BASE.bloomStrength,
  },
  listening: {
    noiseMul: 0.28,
    speedMul: 0.72,
    viscosityMul: 4.5,
    gravityMul: 0.55,
    convergenceSlowdown: 0.55,
    convergenceFreeze: 0,
    convergenceHeatRetention: 0.2,
    convergenceThermalExtinction: 0,
    settleWeight: 0.3,
    recallLateralWeight: 0.18,
    recallVerticalWeight: 0.08,
    compressT: 0.15,
    thinT: 0,
    massDimT: 0,
    materialClaimT: 0,
    exposure: 0.55,
    bloomStrength: 0.14,
  },
  processing: {
    noiseMul: 0.2,
    speedMul: 0.62,
    viscosityMul: 5.0,
    gravityMul: 0.45,
    convergenceSlowdown: 0.8,
    convergenceFreeze: 0.45,
    convergenceHeatRetention: 0.4,
    convergenceThermalExtinction: 0,
    settleWeight: 0.4,
    recallLateralWeight: 0.22,
    recallVerticalWeight: 0.1,
    compressT: 0.8,
    thinT: 0.08,
    massDimT: 0.16,
    materialClaimT: 0,
    exposure: 0.54,
    bloomStrength: 0.2,
  },
  speaking: {
    noiseMul: 0.5,
    speedMul: 0.85,
    viscosityMul: 2.0,
    gravityMul: 0.7,
    convergenceSlowdown: 0.3,
    convergenceFreeze: 0,
    convergenceHeatRetention: 0.25,
    convergenceThermalExtinction: 0,
    settleWeight: 0.08,
    recallLateralWeight: 0.04,
    recallVerticalWeight: 0,
    compressT: 0.1,
    thinT: 0,
    massDimT: 0,
    materialClaimT: 0,
    exposure: 0.56,
    bloomStrength: 0.16,
  },
  resolution: {
    noiseMul: 0.08,
    speedMul: 0.3,
    viscosityMul: 8.0,
    gravityMul: 0.25,
    convergenceSlowdown: 0.9,
    convergenceFreeze: 0.6,
    convergenceHeatRetention: 0.65,
    convergenceThermalExtinction: 0.25,
    settleWeight: 0.55,
    recallLateralWeight: 0.25,
    recallVerticalWeight: 0.12,
    compressT: 0.8,
    thinT: 0.05,
    massDimT: 0.1,
    materialClaimT: 0.65,
    exposure: 0.58,
    bloomStrength: 0.22,
  },
});

/** Speaking pulse: energy scales both rate and depth of the modulation. */
const SPEAK_PULSE = Object.freeze({
  baseRateHz: 1.2,
  energyRateHz: 1.6,
  noiseDepth: 1.15,
  speedDepth: 0.4,
  bloomDepth: 0.16,
});

const TAU = Math.PI * 2;

export class SourceChamberDrive {
  constructor() {
    this.current = { ...PROFILES.dormant };
    this.pulsePhase = 0;
  }

  /** Instantly re-anchor at dormant (used around post-enter and resets). */
  reset() {
    this.current = { ...PROFILES.dormant };
    this.pulsePhase = 0;
  }

  /**
   * Ease toward `state`'s profile and author `app.runtime` + look.
   * Must not run while a post-enter drive owns the runtime.
   */
  update(app, dt, state, energy01) {
    const rt = app?.runtime;
    if (!rt) return;

    const target = PROFILES[state] ?? PROFILES.dormant;
    const k = 1 - Math.exp(-Math.max(dt, 0) / EASE_TAU_SEC);
    const cur = this.current;
    for (const key of Object.keys(cur)) {
      cur[key] += (target[key] - cur[key]) * k;
    }

    const energy = Math.min(1, Math.max(0, energy01 ?? 0));
    let noisePulse = 0;
    let speedPulse = 0;
    let bloomPulse = 0;
    if (state === "speaking" && energy > 0.001) {
      this.pulsePhase +=
        dt * (SPEAK_PULSE.baseRateHz + SPEAK_PULSE.energyRateHz * energy);
      const wave = 0.5 + 0.5 * Math.sin(this.pulsePhase * TAU);
      noisePulse = SPEAK_PULSE.noiseDepth * energy * wave;
      speedPulse = SPEAK_PULSE.speedDepth * energy * wave;
      bloomPulse = SPEAK_PULSE.bloomDepth * energy * wave;
    }

    rt.noise = SOURCE_PLAY_BASE.noise * (cur.noiseMul + noisePulse);
    rt.speed = SOURCE_PLAY_BASE.speed * (cur.speedMul + speedPulse);
    rt.dynamicViscosity =
      SOURCE_PLAY_BASE.dynamicViscosity * cur.viscosityMul;
    rt.gravity = SOURCE_PLAY_BASE.gravity * cur.gravityMul;

    rt.convergenceSlowdown = cur.convergenceSlowdown;
    rt.convergenceFreeze = cur.convergenceFreeze;
    rt.convergenceHeatRetention = cur.convergenceHeatRetention;
    rt.convergenceThermalExtinction = cur.convergenceThermalExtinction;

    rt.settleWeight = cur.settleWeight;
    rt.recallLateralWeight = cur.recallLateralWeight;
    rt.recallVerticalWeight = cur.recallVerticalWeight;
    rt.returnBodyWeight = 0;

    rt.compressT = cur.compressT;
    rt.thinT = cur.thinT;
    rt.massDimT = cur.massDimT;
    rt.opacityT = 0;
    rt.materialClaimT = cur.materialClaimT;

    app.setLook({
      exposure: cur.exposure,
      bloomStrength: cur.bloomStrength + bloomPulse,
    });
  }
}
