/**
 * Lenox eyes driver — Character Pass 01.
 *
 * Third runtime author next to postEnterDrive / sourceChamberDrive; the
 * bridge runs exactly one per frame. States: idle / attract / waking / alive.
 *
 * Character system (alive):
 *   – ocular fields: hollow annulus shells with negative-space pupils and a
 *     sparse focal core (w=1 targets) that carries the gaze
 *   – saccadic gaze: snap toward the pointer past a threshold, hold with
 *     micro-tremble when stationary, drift back to center when idle
 *   – blink: closing → hold → reopen-with-overshoot on `settleSquashT`
 *     (pure uniform animation, zero buffer uploads)
 *   – squint: fast pointer motion narrows the aperture
 *
 * Dev tuning: `globalThis.__LENOX_TUNE__ = {aperture, almond, focalFrac,
 * focalRadius, gazeRangeX, gazeRangeY, sizeMul}` (applied on next state
 * enter); `globalThis.__LENOX_BLINK__ = true` forces a blink.
 */

const SOURCE_PLAY_BASE = Object.freeze({
  gravity: 1,
  noise: 1.08,
  speed: 1.02,
  dynamicViscosity: 0.034,
});

const EASE_TAU_SEC = 0.45;
const WAKE_DURATION_SEC = 2.4;

/**
 * Fluid mass always packs to its equilibrium volume (density ≈ restDensity),
 * so authored shapes only hold if the mass fits: simulate fewer particles
 * AND raise restDensity so the packed volume matches the ocular fields
 * (incl. the negative-space pupil) instead of inflating them shut.
 */
const LENOX_PARTICLE_CAP = 8192;
const LENOX_REST_DENSITY_MUL = 12;

/** Sim-space layout (64³ grid). Ocular centerline y = 37. */
const EYE_CENTER_Y = 37;
const GATHER_CLUSTER = [
  { center: [32, 34, 30], radii: [8, 7, 5] },
];

/**
 * Character Pass 02 presets. Tunables (override any via __LENOX_TUNE__):
 * entityScale, eyeSeparation, apertureWidth (rx), apertureHeight (ry),
 * pupilVoidSize, upperLidWeight (reserved), focalSignalStrength, auraSpread,
 * particleOpacity, particleScale (sizeMul), gazeStrength.
 */
const PRESETS = Object.freeze({
  readable: {
    entityScale: 1,
    eyeSeparation: 23,
    apertureWidth: 7.4,
    apertureHeight: 4.8,
    pupilVoidSize: 0.44,
    almond: 0.55,
    focalSignalStrength: 1.2,
    auraSpread: 2.1,
    focalRadius: 0.2,
    particleOpacity: 1,
    particleScale: 0.8,
    gazeStrength: 1,
  },
  subtle: {
    entityScale: 0.88,
    eyeSeparation: 22,
    apertureWidth: 7.0,
    apertureHeight: 4.4,
    pupilVoidSize: 0.4,
    almond: 0.6,
    focalSignalStrength: 0.7,
    auraSpread: 2.4,
    focalRadius: 0.17,
    particleOpacity: 0.88,
    particleScale: 0.74,
    gazeStrength: 0.85,
  },
  intense: {
    entityScale: 1.12,
    eyeSeparation: 24,
    apertureWidth: 7.8,
    apertureHeight: 5.2,
    pupilVoidSize: 0.48,
    almond: 0.5,
    focalSignalStrength: 1.8,
    auraSpread: 1.9,
    focalRadius: 0.24,
    particleOpacity: 1,
    particleScale: 0.86,
    gazeStrength: 1.2,
  },
});

/** Pupil occluder size relative to the authored void (covers stray mass). */
const PUPIL_OCCLUDER_MUL = 1.18;
const EYE_Z = 30;
const PUPIL_Z = 28.2;

const GAZE = Object.freeze({
  rangeX: 2.2,
  rangeY: 1.5,
  /** NDC distance that triggers a saccade snap. */
  saccadeThreshold: 0.055,
  snapEase: 0.34,
  settleEase: 0.1,
  trembleAmp: 0.012,
  trembleIntervalSec: 0.14,
  idleReturnSec: 4.0,
});

const BLINK = Object.freeze({
  intervalMinSec: 3.2,
  intervalMaxSec: 6.5,
  idleIntervalMulWhenAway: 1.6,
  closeSec: 0.09,
  holdSec: 0.06,
  openSec: 0.2,
  closedSquash: 0.07,
  overshoot: 1.08,
});

const SQUINT = Object.freeze({
  /** Pointer NDC speed (units/sec) mapped to squash reduction. */
  speedForFull: 1.6,
  maxNarrow: 0.3,
  ease: 0.12,
});

const BREATHE_RATE_HZ = 0.22;
const BREATHE_DEPTH = 0.06;

const PROFILES = Object.freeze({
  idle: {
    noiseMul: 1.05,
    speedMul: 0.95,
    viscosityMul: 1.4,
    gravityMul: 0.1,
    settleWeight: 0,
    pointerInfluence: 1,
    sizeMul: 1,
  },
  attract: {
    noiseMul: 0.75,
    speedMul: 1.0,
    viscosityMul: 1.6,
    gravityMul: 0.06,
    settleWeight: 0.05,
    pointerInfluence: 2.4,
    sizeMul: 1,
  },
  waking: {
    noiseMul: 0.35,
    speedMul: 1.2,
    viscosityMul: 3.2,
    gravityMul: 0,
    settleWeight: 0.85,
    pointerInfluence: 0.4,
    sizeMul: 0.92,
  },
  alive: {
    noiseMul: 0.12,
    speedMul: 0.78,
    viscosityMul: 4.8,
    gravityMul: 0,
    settleWeight: 1.15,
    pointerInfluence: 0.55,
    sizeMul: 0.8,
  },
});

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Active preset + user overrides → resolved ocular spec. */
function resolveOcularSpec() {
  const presetName =
    (typeof globalThis !== "undefined" && globalThis.__LENOX_PRESET__) ||
    "readable";
  const tune =
    (typeof globalThis !== "undefined" && globalThis.__LENOX_TUNE__) || {};
  const p = { ...(PRESETS[presetName] ?? PRESETS.readable), ...tune };

  const s = p.entityScale;
  const halfSep = (p.eyeSeparation * s) / 2;
  return {
    presetName,
    leftX: 32 - halfSep,
    rightX: 32 + halfSep,
    centerY: EYE_CENTER_Y,
    zBase: EYE_Z,
    rx: p.apertureWidth * s,
    ry: p.apertureHeight * s,
    rz: 1.4,
    aperture: p.pupilVoidSize,
    almond: p.almond,
    auraSpread: p.auraSpread,
    focalRadius: p.focalRadius,
    focalSignalStrength: p.focalSignalStrength,
    particleOpacity: p.particleOpacity,
    particleScale: p.particleScale,
    gazeStrength: p.gazeStrength,
  };
}

export class LenoxEyesDrive {
  constructor() {
    this.current = { ...PROFILES.idle };
    this.requestedState = "idle";
    this.activeState = "idle";
    this.stateElapsed = 0;
    this.breathePhase = 0;
    this.authoredShape = null; // "gather" | "eyes" | null
    this.baseActualSize = null;

    // Gaze (all in centered NDC).
    this.pointerX = 0;
    this.pointerY = 0;
    this.gazeX = 0;
    this.gazeY = 0;
    this.trembleX = 0;
    this.trembleY = 0;
    this.trembleTimer = 0;
    this.lastPointerMoveAt = 0;
    this.pointerSpeed = 0;
    this.clock = 0;

    // Blink.
    this.blinkPhase = "none"; // none | closing | hold | opening
    this.blinkTimer =
      BLINK.intervalMinSec +
      Math.random() * (BLINK.intervalMaxSec - BLINK.intervalMinSec);
    this.blinkT = 0;
    this.blinkSquash = 1;
    this.squintSquash = 1;

    // Character Pass 02.
    this.spec = null;
    this.presence = 0; // 0..1 pupil occluder fade-in while alive
  }

  /** @param {"idle"|"attract"|"waking"|"alive"} state */
  setState(state) {
    if (!PROFILES[state] || state === this.requestedState) return;
    this.requestedState = state;
  }

  /** Pointer in centered NDC (-0.5..0.5, +y up). */
  setGazeTarget(x, y) {
    const nx = Math.max(-0.5, Math.min(0.5, x));
    const ny = Math.max(-0.5, Math.min(0.5, y));
    const dx = nx - this.pointerX;
    const dy = ny - this.pointerY;
    if (dx !== 0 || dy !== 0) {
      this.lastPointerMoveAt = this.clock;
      // Instantaneous speed estimate; smoothed in update().
      this.pointerSpeed = Math.min(
        4,
        Math.sqrt(dx * dx + dy * dy) * 60, // assume ~1 frame between events
      );
    }
    this.pointerX = nx;
    this.pointerY = ny;
  }

  updateBlink(dt) {
    // Dev hook: force a blink.
    if (typeof globalThis !== "undefined" && globalThis.__LENOX_BLINK__) {
      globalThis.__LENOX_BLINK__ = false;
      if (this.blinkPhase === "none") {
        this.blinkPhase = "closing";
        this.blinkT = 0;
      }
    }

    if (this.activeState !== "alive") {
      this.blinkSquash = 1;
      return;
    }

    if (this.blinkPhase === "none") {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkPhase = "closing";
        this.blinkT = 0;
      }
      this.blinkSquash = 1;
      return;
    }

    this.blinkT += dt;
    if (this.blinkPhase === "closing") {
      const t = clamp01(this.blinkT / BLINK.closeSec);
      this.blinkSquash = 1 + (BLINK.closedSquash - 1) * t * t;
      if (t >= 1) {
        this.blinkPhase = "hold";
        this.blinkT = 0;
      }
    } else if (this.blinkPhase === "hold") {
      this.blinkSquash = BLINK.closedSquash;
      if (this.blinkT >= BLINK.holdSec) {
        this.blinkPhase = "opening";
        this.blinkT = 0;
      }
    } else if (this.blinkPhase === "opening") {
      const t = clamp01(this.blinkT / BLINK.openSec);
      // Reopen with slight overshoot, then settle to 1.
      const eased = 1 - Math.pow(1 - t, 3);
      this.blinkSquash =
        BLINK.closedSquash +
        (BLINK.overshoot - BLINK.closedSquash) * eased -
        (BLINK.overshoot - 1) * t * t;
      if (t >= 1) {
        this.blinkPhase = "none";
        this.blinkSquash = 1;
        const away = this.clock - this.lastPointerMoveAt > GAZE.idleReturnSec;
        const mul = away ? BLINK.idleIntervalMulWhenAway : 1;
        this.blinkTimer =
          (BLINK.intervalMinSec +
            Math.random() * (BLINK.intervalMaxSec - BLINK.intervalMinSec)) *
          mul;
      }
    }
  }

  updateGaze(dt) {
    const pointerIdle =
      this.clock - this.lastPointerMoveAt > GAZE.idleReturnSec;
    const goalX = pointerIdle ? 0 : this.pointerX;
    const goalY = pointerIdle ? 0 : this.pointerY;

    const dx = goalX - this.gazeX;
    const dy = goalY - this.gazeY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > GAZE.saccadeThreshold) {
      // Saccade: snap toward the goal.
      this.gazeX += dx * GAZE.snapEase;
      this.gazeY += dy * GAZE.snapEase;
      this.trembleX = 0;
      this.trembleY = 0;
    } else {
      // Fixation: slow settle + micro-tremble.
      this.gazeX += dx * GAZE.settleEase;
      this.gazeY += dy * GAZE.settleEase;
      this.trembleTimer -= dt;
      if (this.trembleTimer <= 0) {
        this.trembleTimer =
          GAZE.trembleIntervalSec * (0.7 + Math.random() * 0.6);
        this.trembleX = (Math.random() - 0.5) * 2 * GAZE.trembleAmp;
        this.trembleY = (Math.random() - 0.5) * 2 * GAZE.trembleAmp;
      }
    }

    // Squint from smoothed pointer speed (decays when quiet).
    this.pointerSpeed *= Math.pow(0.02, dt); // fast decay
    const squintTarget =
      1 -
      Math.min(1, this.pointerSpeed / SQUINT.speedForFull) * SQUINT.maxNarrow;
    this.squintSquash += (squintTarget - this.squintSquash) * SQUINT.ease;
  }

  /**
   * Author runtime for this frame. Returns the effective state so the bridge
   * can emit changes (waking auto-advances to alive).
   */
  update(app, dt) {
    const rt = app?.runtime;
    if (!rt) return this.activeState;
    this.clock += Math.max(dt, 0);

    if (this.baseActualSize === null && Number.isFinite(rt.actualSize)) {
      this.baseActualSize = rt.actualSize;
      this.baseRestDensity = rt.restDensity;
    }

    // Packed-volume regime: fewer particles at higher rest density so the
    // equilibrium volume matches the authored ocular fields.
    rt.particles = Math.min(rt.particles, LENOX_PARTICLE_CAP);
    if (Number.isFinite(this.baseRestDensity)) {
      rt.restDensity = this.baseRestDensity * LENOX_REST_DENSITY_MUL;
    }

    // Enter-state one-shots.
    if (this.requestedState !== this.activeState) {
      this.activeState = this.requestedState;
      this.stateElapsed = 0;
      if (this.activeState === "waking" && this.authoredShape !== "gather") {
        app.mlsMpmSim?.buildLenoxClusterTargets?.(GATHER_CLUSTER);
        this.authoredShape = "gather";
      }
      if (this.activeState === "alive" && this.authoredShape !== "eyes") {
        this.spec = resolveOcularSpec();
        app.mlsMpmSim?.buildLenoxOcularTargets?.(this.spec);
        this.authoredShape = "eyes";
      }
      if (this.activeState === "idle" || this.activeState === "attract") {
        this.authoredShape = null;
      }
    }

    // Preset hot-switch while alive (dev): re-author on change.
    if (this.activeState === "alive" && this.spec) {
      const presetName =
        (typeof globalThis !== "undefined" && globalThis.__LENOX_PRESET__) ||
        "readable";
      if (presetName !== this.spec.presetName) {
        this.spec = resolveOcularSpec();
        app.mlsMpmSim?.buildLenoxOcularTargets?.(this.spec);
      }
    }

    this.stateElapsed += Math.max(dt, 0);
    if (this.activeState === "waking" && this.stateElapsed >= WAKE_DURATION_SEC) {
      this.requestedState = "alive";
    }

    // Ease channel values toward the state profile.
    const target = PROFILES[this.activeState];
    const k = 1 - Math.exp(-Math.max(dt, 0) / EASE_TAU_SEC);
    const cur = this.current;
    for (const key of Object.keys(cur)) {
      cur[key] += (target[key] - cur[key]) * k;
    }

    this.updateBlink(dt);
    this.updateGaze(dt);

    // Breathing keeps the alive shape organic.
    this.breathePhase += dt * BREATHE_RATE_HZ * Math.PI * 2;
    const breathe =
      this.activeState === "alive"
        ? 1 + Math.sin(this.breathePhase) * BREATHE_DEPTH
        : 1;

    const spec = this.spec ?? resolveOcularSpec();
    const gazeStrength = spec.gazeStrength;
    const gazeOn = this.activeState === "alive" ? 1 : 0;
    const squash =
      this.activeState === "alive"
        ? Math.min(this.blinkSquash, this.squintSquash)
        : 1;

    // Pupil occluders fade in once alive, out otherwise.
    const presenceTarget = this.activeState === "alive" ? 1 : 0;
    this.presence += (presenceTarget - this.presence) * (1 - Math.exp(-dt / 0.5));

    rt.noise = SOURCE_PLAY_BASE.noise * cur.noiseMul;
    rt.speed = SOURCE_PLAY_BASE.speed * cur.speedMul;
    rt.dynamicViscosity = SOURCE_PLAY_BASE.dynamicViscosity * cur.viscosityMul;
    rt.gravity = SOURCE_PLAY_BASE.gravity * cur.gravityMul;

    const gazeSimX =
      (this.gazeX + this.trembleX) * 2 * GAZE.rangeX * gazeStrength * gazeOn;
    const gazeSimY =
      (this.gazeY + this.trembleY) * 2 * GAZE.rangeY * gazeStrength * gazeOn;

    rt.settleWeight = cur.settleWeight * breathe;
    rt.settleOffset.set(gazeSimX, gazeSimY, 0);
    rt.settleSquashT = squash;
    rt.settleSquashCenter = EYE_CENTER_Y;
    rt.lenoxFocalBoost = spec.focalSignalStrength;
    rt.opacityT = 1 - spec.particleOpacity;

    if (this.baseActualSize !== null) {
      rt.actualSize =
        this.baseActualSize *
        (this.activeState === "alive" ? spec.particleScale : cur.sizeMul);
    }

    app.setLenoxOcular?.({
      leftX: spec.leftX,
      rightX: spec.rightX,
      centerY: spec.centerY,
      z: PUPIL_Z,
      rx: spec.rx * spec.aperture * PUPIL_OCCLUDER_MUL,
      ry: spec.ry * spec.aperture * PUPIL_OCCLUDER_MUL * 1.15,
      squash,
      gazeX: gazeSimX,
      gazeY: gazeSimY,
      presence: this.presence,
    });

    // Silence every other authored channel; Lenox owns the frame.
    rt.returnBodyWeight = 0;
    rt.recallLateralWeight = 0;
    rt.recallVerticalWeight = 0;
    rt.convergenceSlowdown = 0;
    rt.convergenceFreeze = 0;
    rt.convergenceHeatRetention = 0;
    rt.convergenceThermalExtinction = 0;
    rt.compressT = 0;
    rt.thinT = 0;
    rt.massDimT = 0;
    rt.materialClaimT = 0;

    rt.lenoxTintT = 1;

    app.setPointerInfluence(cur.pointerInfluence);

    return this.activeState;
  }
}
