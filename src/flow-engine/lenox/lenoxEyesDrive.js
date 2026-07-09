/**
 * Lenox presence driver — Visual Reset Pass.
 *
 * Lenox is a living AI signal field, NOT a face. Third runtime author next
 * to postEnterDrive / sourceChamberDrive; the bridge runs exactly one per
 * frame. States: idle / attract / waking / alive.
 *
 * Presence system (alive), taste principles from the reference: restraint,
 * gentle float, limited-radius attention follow, calm response.
 *   – one coherent signal cloud (envelope fog + core + one density contour)
 *   – two asymmetric ATTENTION NODES (density knots, not eyes) that follow
 *     the pointer within a small radius via `settleOffset` (w-weighted)
 *   – slow float/sway on `settleBob` (whole presence, rigid, organic)
 *   – attention pulse: soft field inhale on `settleSquashT` (no eyelids)
 *   – cursor speed compresses the field slightly (focus, not squint)
 *
 * Dev: `__LENOX_PRESET__` = "signal" | "presence" | "entity" (default
 * presence); `__LENOX_TUNE__` overrides any preset key;
 * `__LENOX_DEBUG_PUPILS__` re-enables the legacy occluder layer.
 */

const SOURCE_PLAY_BASE = Object.freeze({
  gravity: 1,
  noise: 1.08,
  speed: 1.02,
  dynamicViscosity: 0.034,
});

const EASE_TAU_SEC = 0.45;
const WAKE_DURATION_SEC = 2.4;

/** See buildLenoxPresenceTargets: packed-volume regime (mass must fit). */
const LENOX_PARTICLE_CAP = 8192;
const LENOX_REST_DENSITY_MUL = 12;

const PRESENCE_CENTER = Object.freeze({ x: 32, y: 36.5, z: 30 });

/**
 * Presets. Tunables (override via __LENOX_TUNE__): entityScale, nodeSpread,
 * nodeRadius, envelope, core, contourLift, focalSignalStrength,
 * particleOpacity, particleScale, gazeStrength, floatAmp.
 */
const PRESETS = Object.freeze({
  signal: {
    entityScale: 1,
    envelope: [15, 8, 3.6],
    core: [8.5, 4.6, 2.2],
    nodeSpread: 11,
    nodeRadius: 1.7,
    contourLift: 1.05,
    focalSignalStrength: 0.18,
    particleOpacity: 0.82,
    particleScale: 0.7,
    gazeStrength: 0.8,
    floatAmp: 1.1,
  },
  presence: {
    entityScale: 1,
    envelope: [13.5, 7, 3.2],
    core: [9, 5, 2.4],
    nodeSpread: 11.5,
    nodeRadius: 2.0,
    contourLift: 1.02,
    focalSignalStrength: 0.3,
    particleOpacity: 0.92,
    particleScale: 0.76,
    gazeStrength: 1,
    floatAmp: 0.9,
  },
  entity: {
    entityScale: 1.1,
    envelope: [12.5, 6.6, 3],
    core: [9.5, 5.4, 2.6],
    nodeSpread: 12,
    nodeRadius: 2.3,
    contourLift: 1.0,
    focalSignalStrength: 0.45,
    particleOpacity: 1,
    particleScale: 0.82,
    gazeStrength: 1.15,
    floatAmp: 0.7,
  },
});

const GAZE = Object.freeze({
  rangeX: 2.0,
  rangeY: 1.3,
  saccadeThreshold: 0.055,
  snapEase: 0.3,
  settleEase: 0.1,
  trembleAmp: 0.01,
  trembleIntervalSec: 0.14,
  idleReturnSec: 4.0,
});

/** Attention pulse: soft field inhale (abstract, no eyelid read). */
const PULSE = Object.freeze({
  intervalMinSec: 4.0,
  intervalMaxSec: 7.5,
  inhaleSec: 0.22,
  holdSec: 0.1,
  exhaleSec: 0.4,
  depth: 0.86,
});

/** Cursor speed gently compresses the field (focus). */
const FOCUS = Object.freeze({
  speedForFull: 1.6,
  maxCompress: 0.07,
  ease: 0.1,
});

const FLOAT = Object.freeze({
  yRateHz: 0.11,
  yAmp: 0.9,
  xRateHz: 0.047,
  xAmp: 0.45,
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
    noiseMul: 0.2,
    speedMul: 0.8,
    viscosityMul: 4.2,
    gravityMul: 0,
    settleWeight: 1.05,
    pointerInfluence: 0.6,
    sizeMul: 0.78,
  },
});

const GATHER_CLUSTER = [{ center: [32, 34, 30], radii: [8, 7, 5] }];

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Active preset + user overrides → resolved presence spec. */
function resolvePresenceSpec() {
  const presetName =
    (typeof globalThis !== "undefined" && globalThis.__LENOX_PRESET__) ||
    "presence";
  const tune =
    (typeof globalThis !== "undefined" && globalThis.__LENOX_TUNE__) || {};
  const p = { ...(PRESETS[presetName] ?? PRESETS.presence), ...tune };

  const s = p.entityScale;
  const half = (p.nodeSpread * s) / 2;
  return {
    presetName,
    centerX: PRESENCE_CENTER.x,
    centerY: PRESENCE_CENTER.y,
    zBase: PRESENCE_CENTER.z,
    envelopeR: p.envelope.map((r) => r * s),
    coreR: p.core.map((r) => r * s),
    // Calm asymmetry: the two attention nodes differ in height and size.
    nodes: [
      {
        x: PRESENCE_CENTER.x - half,
        y: PRESENCE_CENTER.y + 0.9,
        r: p.nodeRadius * s,
      },
      {
        x: PRESENCE_CENTER.x + half,
        y: PRESENCE_CENTER.y + 0.3,
        r: p.nodeRadius * 0.85 * s,
      },
    ],
    contourLift: p.contourLift,
    focalSignalStrength: p.focalSignalStrength,
    particleOpacity: p.particleOpacity,
    particleScale: p.particleScale,
    gazeStrength: p.gazeStrength,
    floatAmp: p.floatAmp,
  };
}

export class LenoxEyesDrive {
  constructor() {
    this.current = { ...PROFILES.idle };
    this.requestedState = "idle";
    this.activeState = "idle";
    this.stateElapsed = 0;
    this.breathePhase = 0;
    this.authoredShape = null; // "gather" | "presence" | null
    this.baseActualSize = null;
    this.baseRestDensity = null;

    // Attention (centered NDC).
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

    // Attention pulse.
    this.pulsePhase = "none"; // none | inhale | hold | exhale
    this.pulseTimer =
      PULSE.intervalMinSec +
      Math.random() * (PULSE.intervalMaxSec - PULSE.intervalMinSec);
    this.pulseT = 0;
    this.pulseSquash = 1;
    this.focusCompress = 1;

    this.spec = null;
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
      this.pointerSpeed = Math.min(4, Math.sqrt(dx * dx + dy * dy) * 60);
    }
    this.pointerX = nx;
    this.pointerY = ny;
  }

  updatePulse(dt) {
    if (typeof globalThis !== "undefined" && globalThis.__LENOX_BLINK__) {
      globalThis.__LENOX_BLINK__ = false;
      if (this.pulsePhase === "none") {
        this.pulsePhase = "inhale";
        this.pulseT = 0;
      }
    }

    if (this.activeState !== "alive") {
      this.pulseSquash = 1;
      return;
    }

    if (this.pulsePhase === "none") {
      this.pulseTimer -= dt;
      if (this.pulseTimer <= 0) {
        this.pulsePhase = "inhale";
        this.pulseT = 0;
      }
      this.pulseSquash = 1;
      return;
    }

    this.pulseT += dt;
    if (this.pulsePhase === "inhale") {
      const t = clamp01(this.pulseT / PULSE.inhaleSec);
      this.pulseSquash = 1 + (PULSE.depth - 1) * t * t;
      if (t >= 1) {
        this.pulsePhase = "hold";
        this.pulseT = 0;
      }
    } else if (this.pulsePhase === "hold") {
      this.pulseSquash = PULSE.depth;
      if (this.pulseT >= PULSE.holdSec) {
        this.pulsePhase = "exhale";
        this.pulseT = 0;
      }
    } else if (this.pulsePhase === "exhale") {
      const t = clamp01(this.pulseT / PULSE.exhaleSec);
      const eased = 1 - Math.pow(1 - t, 3);
      this.pulseSquash = PULSE.depth + (1 - PULSE.depth) * eased;
      if (t >= 1) {
        this.pulsePhase = "none";
        this.pulseSquash = 1;
        this.pulseTimer =
          PULSE.intervalMinSec +
          Math.random() * (PULSE.intervalMaxSec - PULSE.intervalMinSec);
      }
    }
  }

  updateAttention(dt) {
    const pointerIdle =
      this.clock - this.lastPointerMoveAt > GAZE.idleReturnSec;
    const goalX = pointerIdle ? 0 : this.pointerX;
    const goalY = pointerIdle ? 0 : this.pointerY;

    const dx = goalX - this.gazeX;
    const dy = goalY - this.gazeY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > GAZE.saccadeThreshold) {
      this.gazeX += dx * GAZE.snapEase;
      this.gazeY += dy * GAZE.snapEase;
      this.trembleX = 0;
      this.trembleY = 0;
    } else {
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

    // Focus compression from smoothed pointer speed.
    this.pointerSpeed *= Math.pow(0.02, dt);
    const compressTarget =
      1 -
      Math.min(1, this.pointerSpeed / FOCUS.speedForFull) * FOCUS.maxCompress;
    this.focusCompress += (compressTarget - this.focusCompress) * FOCUS.ease;
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
      if (this.activeState === "alive" && this.authoredShape !== "presence") {
        this.spec = resolvePresenceSpec();
        app.mlsMpmSim?.buildLenoxPresenceTargets?.(this.spec);
        this.authoredShape = "presence";
      }
      if (this.activeState === "idle" || this.activeState === "attract") {
        this.authoredShape = null;
      }
    }

    this.stateElapsed += Math.max(dt, 0);
    if (this.activeState === "waking" && this.stateElapsed >= WAKE_DURATION_SEC) {
      this.requestedState = "alive";
    }

    // Preset hot-switch while alive (dev): re-author on change.
    if (this.activeState === "alive" && this.spec) {
      const presetName =
        (typeof globalThis !== "undefined" && globalThis.__LENOX_PRESET__) ||
        "presence";
      if (presetName !== this.spec.presetName) {
        this.spec = resolvePresenceSpec();
        app.mlsMpmSim?.buildLenoxPresenceTargets?.(this.spec);
      }
    }

    // Ease channel values toward the state profile.
    const target = PROFILES[this.activeState];
    const k = 1 - Math.exp(-Math.max(dt, 0) / EASE_TAU_SEC);
    const cur = this.current;
    for (const key of Object.keys(cur)) {
      cur[key] += (target[key] - cur[key]) * k;
    }

    this.updatePulse(dt);
    this.updateAttention(dt);

    this.breathePhase += dt * BREATHE_RATE_HZ * Math.PI * 2;
    const breathe =
      this.activeState === "alive"
        ? 1 + Math.sin(this.breathePhase) * BREATHE_DEPTH
        : 1;

    const spec = this.spec ?? resolvePresenceSpec();
    const gazeOn = this.activeState === "alive" ? 1 : 0;
    const squash =
      this.activeState === "alive"
        ? Math.min(this.pulseSquash, this.focusCompress)
        : 1;

    rt.noise = SOURCE_PLAY_BASE.noise * cur.noiseMul;
    rt.speed = SOURCE_PLAY_BASE.speed * cur.speedMul;
    rt.dynamicViscosity = SOURCE_PLAY_BASE.dynamicViscosity * cur.viscosityMul;
    rt.gravity = SOURCE_PLAY_BASE.gravity * cur.gravityMul;

    const gazeSimX =
      (this.gazeX + this.trembleX) * 2 * GAZE.rangeX * spec.gazeStrength * gazeOn;
    const gazeSimY =
      (this.gazeY + this.trembleY) * 2 * GAZE.rangeY * spec.gazeStrength * gazeOn;

    rt.settleWeight = cur.settleWeight * breathe;
    rt.settleOffset.set(gazeSimX, gazeSimY, 0);
    // Gentle float/sway of the whole presence.
    const floatOn = this.activeState === "alive" ? spec.floatAmp : 0;
    rt.settleBob.set(
      Math.sin(this.clock * FLOAT.xRateHz * Math.PI * 2) * FLOAT.xAmp * floatOn,
      Math.sin(this.clock * FLOAT.yRateHz * Math.PI * 2) * FLOAT.yAmp * floatOn,
      0,
    );
    rt.settleSquashT = squash;
    rt.settleSquashCenter = PRESENCE_CENTER.y;
    rt.lenoxFocalBoost = spec.focalSignalStrength;
    rt.opacityT = 1 - spec.particleOpacity;

    if (this.baseActualSize !== null) {
      rt.actualSize =
        this.baseActualSize *
        (this.activeState === "alive" ? spec.particleScale : cur.sizeMul);
    }

    // Legacy occluder layer stays dark unless explicitly debugged.
    const debugPupils =
      typeof globalThis !== "undefined" && !!globalThis.__LENOX_DEBUG_PUPILS__;
    app.setLenoxOcular?.({
      leftX: spec.nodes[0].x,
      rightX: spec.nodes[1].x,
      centerY: spec.centerY,
      z: 28.2,
      rx: spec.nodes[0].r * 1.6,
      ry: spec.nodes[0].r * 1.1,
      squash,
      gazeX: gazeSimX,
      gazeY: gazeSimY,
      presence: debugPupils && this.activeState === "alive" ? 1 : 0,
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
