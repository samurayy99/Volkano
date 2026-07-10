/**
 * Lenox presence driver — Expressive Character Pass.
 *
 * Layered identity (learned across passes 01–04):
 *   readability — deterministic rig: deformable eyes, brows, mouth, head
 *   emotion     — pose grammar: shape presets lerped per frame (this file)
 *   life        — MLS-MPM particles wrapping the rig (aura, breath, wake)
 *
 * States: idle / attract / waking / alive. Emotions (alive only): neutral,
 * happy, sad, angry, surprised, suspicious, thinking, listening. Temporary
 * reactions: laugh, startle, tired. Blink/saccade/gaze-clamp from the gaze
 * rig pass. NOTE: camera views the sim from -z → sim +x = screen LEFT, so
 * every screen-x intent is negated into sim space.
 */

const SOURCE_PLAY_BASE = Object.freeze({
  gravity: 1,
  noise: 1.08,
  speed: 1.02,
  dynamicViscosity: 0.034,
});

const EASE_TAU_SEC = 0.45;
const POSE_TAU_SEC = 0.22;
const WAKE_DURATION_SEC = 2.4;
const LENOX_PARTICLE_CAP = 8192;
const LENOX_REST_DENSITY_MUL = 12;

const PRESENCE_CENTER = Object.freeze({ x: 32, y: 36.5, z: 30 });
const EYE_Z = 28.4;
const DEG = Math.PI / 180;

/** Head geometry (sim units). */
const FACE = Object.freeze({
  eyeHalfSep: 5.9,
  eyeY: 1.6, // above presence center
  eyeRx: 3.3,
  eyeRy: 2.1,
  anchorR: 0.8,
  browLen: 2.6,
  browY: 4.6, // above presence center
  mouthY: -3.6, // below presence center
});

/**
 * Emotion pose grammar. Per-side arrays are [left, right] in SCREEN terms.
 * eyeRotDeg positive = outer corner up. browRotDeg positive = inner end up.
 */
const EMOTIONS = Object.freeze({
  neutral: {
    eyeSy: [1, 1],
    eyeSx: [1, 1],
    eyeRotDeg: [0, 0],
    browYOff: [0, 0],
    browRotDeg: [0, 0],
    browOn: 1,
    mouthCurve: 0.18,
    mouthWidth: 3.6,
    mouthOpen: 0,
    tiltDeg: 0,
    accent: "#46d4ee",
    noiseD: 0,
    speedD: 0,
  },
  happy: {
    eyeSy: [0.5, 0.5],
    eyeSx: [1.02, 1.02],
    eyeRotDeg: [12, 12],
    browYOff: [0.7, 0.7],
    browRotDeg: [6, 6],
    browOn: 1,
    mouthCurve: 1,
    mouthWidth: 4.6,
    mouthOpen: 0,
    tiltDeg: 1.5,
    accent: "#63e0c8",
    noiseD: 0.25,
    speedD: 0.15,
  },
  sad: {
    eyeSy: [0.72, 0.72],
    eyeSx: [1, 1],
    eyeRotDeg: [-11, -11],
    browYOff: [-0.2, -0.2],
    browRotDeg: [-13, -13],
    browOn: 1,
    mouthCurve: -0.85,
    mouthWidth: 3.4,
    mouthOpen: 0,
    tiltDeg: -2,
    accent: "#6f9bff",
    noiseD: -0.35,
    speedD: -0.25,
  },
  angry: {
    eyeSy: [0.52, 0.52],
    eyeSx: [0.98, 0.98],
    eyeRotDeg: [-16, -16],
    browYOff: [-1.3, -1.3],
    browRotDeg: [-24, -24],
    browOn: 1,
    mouthCurve: -0.3,
    mouthWidth: 2.9,
    mouthOpen: 0,
    tiltDeg: 0,
    accent: "#ff6b5e",
    noiseD: 0.45,
    speedD: 0.3,
  },
  surprised: {
    eyeSy: [1.4, 1.4],
    eyeSx: [1.12, 1.12],
    eyeRotDeg: [0, 0],
    browYOff: [1.5, 1.5],
    browRotDeg: [0, 0],
    browOn: 1,
    mouthCurve: 0,
    mouthWidth: 2.2,
    mouthOpen: 1,
    tiltDeg: 0,
    accent: "#d98cff",
    noiseD: 0.2,
    speedD: 0.1,
  },
  suspicious: {
    eyeSy: [0.34, 0.9],
    eyeSx: [1, 1],
    eyeRotDeg: [-6, 4],
    browYOff: [-0.9, 0.9],
    browRotDeg: [-10, 12],
    browOn: 1,
    mouthCurve: 0.05,
    mouthWidth: 3.0,
    mouthOpen: 0,
    tiltDeg: -1.5,
    accent: "#8fe08a",
    noiseD: -0.2,
    speedD: -0.1,
  },
  thinking: {
    eyeSy: [0.8, 0.8],
    eyeSx: [1, 1],
    eyeRotDeg: [4, 4],
    browYOff: [0.4, 1.1],
    browRotDeg: [4, 10],
    browOn: 1,
    mouthCurve: 0,
    mouthWidth: 1.6,
    mouthOpen: 1,
    tiltDeg: 2,
    accent: "#c99df2",
    noiseD: -0.15,
    speedD: -0.1,
  },
  listening: {
    eyeSy: [1.12, 1.12],
    eyeSx: [1.04, 1.04],
    eyeRotDeg: [2, 2],
    browYOff: [0.5, 0.5],
    browRotDeg: [3, 3],
    browOn: 1,
    mouthCurve: 0.08,
    mouthWidth: 2.8,
    mouthOpen: 0,
    tiltDeg: 0,
    accent: "#ffffff",
    noiseD: -0.25,
    speedD: -0.15,
  },
});

/** Temporary reactions layered over the emotion pose. */
const REACTIONS = Object.freeze({
  laugh: { duration: 1.6 },
  startle: { duration: 0.85 },
  tired: { duration: 5.5 },
});

const GAZE = Object.freeze({
  saccadeThreshold: 0.055,
  snapEase: 0.3,
  settleEase: 0.1,
  trembleAmp: 0.01,
  trembleIntervalSec: 0.14,
  idleReturnSec: 4.0,
  travelFracX: 0.42,
  travelFracY: 0.36,
  gain: 3.2,
  simToNdc: 0.009,
  rightLag: 0.9,
});

const BLINK = Object.freeze({
  intervalMinSec: 3.4,
  intervalMaxSec: 6.8,
  closeSec: 0.09,
  holdSec: 0.05,
  openSec: 0.18,
  closedScale: 0.06,
});

const FLOAT = Object.freeze({
  yRateHz: 0.11,
  yAmp: 0.7,
  xRateHz: 0.047,
  xAmp: 0.35,
});

const BREATHE_RATE_HZ = 0.22;
const BREATHE_DEPTH = 0.05;

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
const clampRange = (v, m) => Math.max(-m, Math.min(m, v));

/** Particle wrap spec (envelope/core/contour/nodes around the face). */
function resolvePresenceSpec() {
  const tune =
    (typeof globalThis !== "undefined" && globalThis.__LENOX_TUNE__) || {};
  const s = tune.entityScale ?? 1;
  return {
    centerX: PRESENCE_CENTER.x,
    centerY: PRESENCE_CENTER.y,
    zBase: PRESENCE_CENTER.z,
    envelopeR: [13.5 * s, 7 * s, 3.2 * s],
    coreR: [9 * s, 5 * s, 2.4 * s],
    nodes: [
      { x: PRESENCE_CENTER.x - FACE.eyeHalfSep * s, y: PRESENCE_CENTER.y + FACE.eyeY, r: 2.0 * s },
      { x: PRESENCE_CENTER.x + FACE.eyeHalfSep * s, y: PRESENCE_CENTER.y + FACE.eyeY, r: 1.7 * s },
    ],
    contourLift: 1.02,
    scale: s,
    particleScale: tune.particleScale ?? 0.76,
    particleOpacity: tune.particleOpacity ?? 0.92,
    gazeStrength: tune.gazeStrength ?? 1,
    focalSignalStrength: tune.focalSignalStrength ?? 0.25,
    floatAmp: tune.floatAmp ?? 0.9,
  };
}

/** Flat pose parameter vector (lerped every frame). */
function poseFromEmotion(e) {
  return {
    eyeSyL: e.eyeSy[0],
    eyeSyR: e.eyeSy[1],
    eyeSxL: e.eyeSx[0],
    eyeSxR: e.eyeSx[1],
    eyeRotL: e.eyeRotDeg[0] * DEG,
    eyeRotR: e.eyeRotDeg[1] * DEG,
    browYL: e.browYOff[0],
    browYR: e.browYOff[1],
    browRotL: e.browRotDeg[0] * DEG,
    browRotR: e.browRotDeg[1] * DEG,
    browOn: e.browOn,
    mouthCurve: e.mouthCurve,
    mouthWidth: e.mouthWidth,
    mouthOpen: e.mouthOpen,
    tilt: e.tiltDeg * DEG,
  };
}

export class LenoxEyesDrive {
  constructor() {
    this.current = { ...PROFILES.idle };
    this.requestedState = "idle";
    this.activeState = "idle";
    this.stateElapsed = 0;
    this.breathePhase = 0;
    this.authoredShape = null;
    this.baseActualSize = null;
    this.baseRestDensity = null;
    this.clock = 0;

    // Gaze.
    this.pointerX = 0;
    this.pointerY = 0;
    this.gazeX = 0;
    this.gazeY = 0;
    this.trembleX = 0;
    this.trembleY = 0;
    this.trembleTimer = 0;
    this.lastPointerMoveAt = 0;

    // Blink.
    this.blinkPhase = "none";
    this.blinkTimer =
      BLINK.intervalMinSec +
      Math.random() * (BLINK.intervalMaxSec - BLINK.intervalMinSec);
    this.blinkT = 0;
    this.blinkScale = 1;

    // Emotion + reaction.
    this.emotion = "neutral";
    this.pose = poseFromEmotion(EMOTIONS.neutral);
    this.accent = EMOTIONS.neutral.accent;
    this.reaction = null; // {name, t}

    this.spec = null;
    this.rigPresence = 0;
  }

  /** @param {"idle"|"attract"|"waking"|"alive"} state */
  setState(state) {
    if (!PROFILES[state] || state === this.requestedState) return;
    this.requestedState = state;
  }

  /** @param {keyof typeof EMOTIONS} emotion */
  setEmotion(emotion) {
    if (EMOTIONS[emotion]) this.emotion = emotion;
  }

  /** @param {"laugh"|"startle"|"tired"} name */
  triggerReaction(name) {
    if (REACTIONS[name]) this.reaction = { name, t: 0 };
  }

  /** Pointer in centered NDC (-0.5..0.5, +y up). */
  setGazeTarget(x, y) {
    const nx = Math.max(-0.5, Math.min(0.5, x));
    const ny = Math.max(-0.5, Math.min(0.5, y));
    if (nx !== this.pointerX || ny !== this.pointerY) {
      this.lastPointerMoveAt = this.clock;
    }
    this.pointerX = nx;
    this.pointerY = ny;
  }

  updateBlink(dt) {
    if (typeof globalThis !== "undefined" && globalThis.__LENOX_BLINK__) {
      globalThis.__LENOX_BLINK__ = false;
      if (this.blinkPhase === "none") {
        this.blinkPhase = "closing";
        this.blinkT = 0;
      }
    }
    if (this.activeState !== "alive") {
      this.blinkScale = 1;
      return;
    }
    if (this.blinkPhase === "none") {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkPhase = "closing";
        this.blinkT = 0;
      }
      this.blinkScale = 1;
      return;
    }
    this.blinkT += dt;
    if (this.blinkPhase === "closing") {
      const t = clamp01(this.blinkT / BLINK.closeSec);
      this.blinkScale = 1 + (BLINK.closedScale - 1) * t * t;
      if (t >= 1) {
        this.blinkPhase = "hold";
        this.blinkT = 0;
      }
    } else if (this.blinkPhase === "hold") {
      this.blinkScale = BLINK.closedScale;
      if (this.blinkT >= BLINK.holdSec) {
        this.blinkPhase = "opening";
        this.blinkT = 0;
      }
    } else {
      const t = clamp01(this.blinkT / BLINK.openSec);
      this.blinkScale = BLINK.closedScale + (1 - BLINK.closedScale) * (1 - Math.pow(1 - t, 3));
      if (t >= 1) {
        this.blinkPhase = "none";
        this.blinkScale = 1;
        this.blinkTimer =
          BLINK.intervalMinSec +
          Math.random() * (BLINK.intervalMaxSec - BLINK.intervalMinSec);
      }
    }
  }

  updateGaze(dt) {
    const pointerIdle = this.clock - this.lastPointerMoveAt > GAZE.idleReturnSec;
    const goalX = pointerIdle ? 0 : this.pointerX;
    const goalY = pointerIdle ? 0 : this.pointerY;
    const dx = goalX - this.gazeX;
    const dy = goalY - this.gazeY;
    if (Math.sqrt(dx * dx + dy * dy) > GAZE.saccadeThreshold) {
      this.gazeX += dx * GAZE.snapEase;
      this.gazeY += dy * GAZE.snapEase;
      this.trembleX = 0;
      this.trembleY = 0;
    } else {
      this.gazeX += dx * GAZE.settleEase;
      this.gazeY += dy * GAZE.settleEase;
      this.trembleTimer -= dt;
      if (this.trembleTimer <= 0) {
        this.trembleTimer = GAZE.trembleIntervalSec * (0.7 + Math.random() * 0.6);
        this.trembleX = (Math.random() - 0.5) * 2 * GAZE.trembleAmp;
        this.trembleY = (Math.random() - 0.5) * 2 * GAZE.trembleAmp;
      }
    }
  }

  /** Reaction overlay: mutates the target pose + returns head motion. */
  applyReaction(target, dt) {
    const head = { bounceY: 0, bounceX: 0, tiltAdd: 0, squash: 1 };
    if (!this.reaction) return head;
    const { name, t } = this.reaction;

    if (name === "laugh") {
      target.eyeSyL = 0.38;
      target.eyeSyR = 0.38;
      target.eyeRotL = 14 * DEG;
      target.eyeRotR = 14 * DEG;
      target.mouthCurve = 1;
      target.mouthWidth = 5.0 + Math.sin(t * 18) * 0.5;
      target.mouthOpen = 0;
      head.bounceY = Math.abs(Math.sin(t * 10)) * 0.8;
      head.tiltAdd = Math.sin(t * 5) * 2.5 * DEG;
      head.squash = 1 - Math.abs(Math.sin(t * 10)) * 0.06;
    } else if (name === "startle") {
      const k = Math.exp(-t * 4);
      target.eyeSyL = 1.5;
      target.eyeSyR = 1.5;
      target.eyeSxL = 1.15;
      target.eyeSxR = 1.15;
      target.browYL = 1.8;
      target.browYR = 1.8;
      target.mouthOpen = 1;
      target.mouthWidth = 2.0;
      head.bounceY = k * 1.4;
      head.squash = 1 + k * 0.08;
    } else if (name === "tired") {
      const cyc = t / REACTIONS.tired.duration;
      if (cyc < 0.75) {
        const droop = clamp01(cyc / 0.75);
        target.eyeSyL = 1 - droop * 0.78;
        target.eyeSyR = 1 - droop * 0.78;
        target.browYL = -droop * 0.8;
        target.browYR = -droop * 0.8;
        target.mouthCurve = 0.05;
        target.mouthWidth = 2.6;
        head.bounceY = -droop * 1.3;
        head.tiltAdd = droop * 4 * DEG;
      } else {
        // Snap awake.
        target.eyeSyL = 1.3;
        target.eyeSyR = 1.3;
        head.bounceY = 0.5;
      }
    }

    this.reaction.t += Math.max(dt, 0);
    if (this.reaction.t >= REACTIONS[name].duration) this.reaction = null;
    return head;
  }

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

    // State one-shots.
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

    // Fluid profile ease.
    const profile = PROFILES[this.activeState];
    const k = 1 - Math.exp(-Math.max(dt, 0) / EASE_TAU_SEC);
    const cur = this.current;
    for (const key of Object.keys(cur)) {
      cur[key] += (profile[key] - cur[key]) * k;
    }

    this.updateBlink(dt);
    this.updateGaze(dt);

    // Emotion pose target (+ reaction overlay), lerped.
    const emotionDef = EMOTIONS[this.emotion] ?? EMOTIONS.neutral;
    const target = poseFromEmotion(emotionDef);
    const head = this.applyReaction(target, dt);
    const pk = 1 - Math.exp(-Math.max(dt, 0) / POSE_TAU_SEC);
    for (const key of Object.keys(this.pose)) {
      this.pose[key] += (target[key] - this.pose[key]) * pk;
    }
    this.accent = this.reaction ? this.accent : emotionDef.accent;

    this.breathePhase += dt * BREATHE_RATE_HZ * Math.PI * 2;
    const breathe =
      this.activeState === "alive"
        ? 1 + Math.sin(this.breathePhase) * BREATHE_DEPTH
        : 1;

    const spec = this.spec ?? resolvePresenceSpec();
    const s = spec.scale;
    const gazeOn = this.activeState === "alive" ? 1 : 0;

    // Fluid runtime (emotion modulates energy).
    rt.noise = SOURCE_PLAY_BASE.noise * cur.noiseMul * (1 + emotionDef.noiseD * gazeOn);
    rt.speed = SOURCE_PLAY_BASE.speed * cur.speedMul * (1 + emotionDef.speedD * gazeOn);
    rt.dynamicViscosity = SOURCE_PLAY_BASE.dynamicViscosity * cur.viscosityMul;
    rt.gravity = SOURCE_PLAY_BASE.gravity * cur.gravityMul;

    const pointerNowX = this.gazeX + this.trembleX;
    const pointerNowY = this.gazeY + this.trembleY;
    // Screen-x → sim-x is mirrored.
    const gazeScreenX = pointerNowX * 2 * 2.0 * spec.gazeStrength * gazeOn;
    const gazeSimY = pointerNowY * 2 * 1.3 * spec.gazeStrength * gazeOn;

    rt.settleWeight = cur.settleWeight * breathe;
    rt.settleOffset.set(-gazeScreenX, gazeSimY, 0);
    const floatOn = this.activeState === "alive" ? spec.floatAmp : 0;
    const bobX = Math.sin(this.clock * FLOAT.xRateHz * Math.PI * 2) * FLOAT.xAmp * floatOn;
    const bobY =
      Math.sin(this.clock * FLOAT.yRateHz * Math.PI * 2) * FLOAT.yAmp * floatOn +
      head.bounceY;
    rt.settleBob.set(bobX, bobY, 0);
    rt.settleSquashT = this.activeState === "alive" ? Math.min(this.blinkScale * 2.5, 1) * head.squash : 1;
    rt.settleSquashCenter = PRESENCE_CENTER.y;
    rt.lenoxFocalBoost = spec.focalSignalStrength;
    rt.opacityT = 1 - spec.particleOpacity;
    if (this.baseActualSize !== null) {
      rt.actualSize =
        this.baseActualSize *
        (this.activeState === "alive" ? spec.particleScale : cur.sizeMul);
    }

    // ---- Build the expressive pose (sim space; screen-x negated). ----
    const presenceTarget = this.activeState === "alive" ? 1 : 0;
    this.rigPresence += (presenceTarget - this.rigPresence) * (1 - Math.exp(-dt / 0.45));

    const p = this.pose;
    const cx = spec.centerX;
    const cy = spec.centerY;
    const eyeYBase = cy + FACE.eyeY * s;
    // Screen-left eye = sim +x side.
    const sideSim = [FACE.eyeHalfSep * s, -FACE.eyeHalfSep * s];
    const sideSign = [1, -1]; // sim-x sign per screen side (L, R)

    const eyes = [];
    const anchors = [];
    const brows = [];
    const maxTx = FACE.eyeRx * GAZE.travelFracX * s;
    const maxTy = FACE.eyeRy * GAZE.travelFracY * s;

    for (let i = 0; i < 2; i++) {
      const eyeSimX = cx + sideSim[i];
      const eyeSy = (i === 0 ? p.eyeSyL : p.eyeSyR) * this.blinkScale;
      const eyeSx = i === 0 ? p.eyeSxL : p.eyeSxR;
      // Outer-corner-up in screen terms → mirror rotation into sim.
      const rot = (i === 0 ? p.eyeRotL : p.eyeRotR) * sideSign[i] * -1;

      eyes.push({
        x: eyeSimX,
        y: eyeYBase,
        z: EYE_Z,
        rot,
        scaleX: FACE.eyeRx * s * eyeSx,
        scaleY: FACE.eyeRy * s * eyeSy,
        baseScaleY: FACE.eyeRy * s,
      });

      const eyeScreenNdcX = -sideSim[i] * GAZE.simToNdc;
      const vx = (pointerNowX - eyeScreenNdcX) * GAZE.gain * spec.gazeStrength;
      const vy = pointerNowY * GAZE.gain * spec.gazeStrength;
      const lag = i === 1 ? GAZE.rightLag : 1;
      anchors.push({
        x: eyeSimX - clampRange(vx * maxTx, maxTx) * lag * gazeOn,
        y: eyeYBase + clampRange(vy * maxTy, maxTy) * lag * gazeOn,
        r: FACE.anchorR * s,
      });

      const browY = i === 0 ? p.browYL : p.browYR;
      const browRot = (i === 0 ? p.browRotL : p.browRotR) * sideSign[i] * -1;
      brows.push({
        x: eyeSimX,
        y: cy + (FACE.browY + browY) * s,
        rot: browRot,
        len: FACE.browLen * s,
        visible: p.browOn > 0.5,
      });
    }

    app.setLenoxRig?.({
      presence: this.rigPresence,
      accentColor: this.accent,
      head: {
        x: bobX + head.bounceX,
        y: bobY,
        tilt: p.tilt + head.tiltAdd,
        scaleX: 1,
        scaleY: head.squash,
      },
      eyes,
      anchors,
      brows,
      mouth: {
        x: cx,
        y: cy + FACE.mouthY * s,
        curve: p.mouthCurve,
        width: p.mouthWidth * s,
        open: p.mouthOpen,
        visible: true,
      },
    });

    // Silence other authored channels.
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
