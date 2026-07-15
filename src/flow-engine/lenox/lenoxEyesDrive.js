/**
 * Lenox presence driver — Recovery Pass.
 *
 * Lifecycle (legacy aliases accepted):
 *   dormant/engaged — wide free-fluid signal field (dedicated seeding;
 *     never the chamber slit, never a pre-formed face). Pointer reaction
 *     transfers momentum locally; no spring recentres the field.
 *   armed          — same free matter, marginal focus; WAKE affordance is UI-side.
 *   awakening      — PHYSICAL LENOX (~3.5s): the SAME heavy matter keeps
 *     its energy through the wake. One controlled compression impulse
 *     (undamped — the recoil is visible, kinetic cyan flashes), then the
 *     mass glides damped into the presence while eyes open as negative
 *     spaces in it. No evacuation, no void, no fade tricks.
 *   present        — expressive rig (emotions/reactions from the accepted
 *     character pass) inside a heavy, calm field; the rig carries the
 *     face, particles carry weight and presence — never covering the eyes.
 *
 * Ownership rules:
 *   – the rig owns blink entirely; the particle field is never squashed
 *   – shell gaze factor is 0 in the kernel; only focal particles follow,
 *     clamped to the same travel range as the rig anchors
 *   – pointer force in present is near-zero: the cursor must not drag
 *     particles through the face
 *   – brand default cyan/silver; emotion accent colors only behind
 *     __LENOX_TUNE__.emotionColors
 *
 * Silver-material knobs (Session 1, live-tunable via __LENOX_TUNE__):
 *   metalness (0.85) · roughness (0.3) · envIntensity (1.35) ·
 *   silverGain (1) · keyIntensity (2.4) · hemiIntensity (0.3) ·
 *   keyX/keyY/keyZ (1.35 / 0.62 / -0.35; world +x = screen LEFT)
 *
 * Pre-wake play contract: particles begin as a wide free-fluid field,
 * with zero settle targets in dormant / engaged / armed. The cursor may
 * push, shear and ricochet the matter; nothing pulls it back to centre.
 * Knobs: dustScale / dustOpacity for the pre-wake look.
 *
 * Session 1.5B — Critical Settle & Density Gate:
 *   present ships SOVEREIGN: every idle motion source is OFF by default
 *   and returns one by one via __LENOX_TUNE__ (restore values in parens):
 *   tremorAmp (0 · restore 1) · floatAmp (0 · restore 0.9) ·
 *   breatheDepth (0 · restore 0.05) · presentNoiseMul (0 · restore 1).
 *   Physics, not symptom-muting: velocity is zeroed ONCE at the
 *   awakening→present hand-off (scheduleVelocityZero) and the settle
 *   spring gets frame-rate-independent exp(-rate·dt) damping, role-graded:
 *   settleDampingShell (12) hard on the body, settleDampingFocal (3.5)
 *   lively for gaze. wallRestitution is 0 in present.
 *   Density: desktop default 16384 (particleCount knob; mobile capped by
 *   device budget) — rest density scales with count (constant silhouette),
 *   shard size compensates by cbrt. Count is LOCKED once the presence is
 *   authored: A/B switches require a reset/reload BEFORE the wake.
 *
 * NOTE: the camera views the sim from -z → sim +x = screen LEFT; every
 * screen-x intent is negated into sim space.
 */

const SOURCE_PLAY_BASE = Object.freeze({
  gravity: 1,
  noise: 1.08,
  speed: 1.02,
  dynamicViscosity: 0.034,
});

const EASE_TAU_SEC = 0.45;
const POSE_TAU_SEC = 0.22;
/** Density-law reference: LENOX_REST_DENSITY_MUL was tuned at this count. */
const LENOX_DENSITY_REF = 8192;
/** Desktop default population (Session 1.5B density gate). */
const LENOX_DESKTOP_COUNT = 16384;
/**
 * Keep the full desktop field through the wake. Dropping from 16k dust to an
 * 8k formation made half the material vanish at the exact moment that should
 * feel most physical. The device budget still caps this on smaller hardware.
 */
const LENOX_CHARACTER_COUNT = LENOX_DESKTOP_COUNT;
// The earlier 12x multiplier was tuned at 8k and makes the 16k mode overly
// stiff during the wake. This lower target keeps the field dense without
// turning the formation into a solver-bound brick.
const LENOX_REST_DENSITY_MUL = 6;

const PRESENCE_CENTER = Object.freeze({ x: 32, y: 36.5, z: 30 });
const DEG = Math.PI / 180;
const BRAND_ACCENT = "#46d4ee";

/**
 * LENOX PRIME signal grammar (character sheet, Concept 01).
 *
 * The visor is a DISPLAY, not an eye socket. Identity is carried by three
 * primitives only — vertical capsule eyes, simple arcs, one small mouth —
 * in soft cyan. There is no iris, no ring stack, no pupil, no lid, no glint
 * and no brow: those read as a pseudo-eyeball and made Lenox look tired.
 *
 * Authored in FACE UNITS: an isotropic 2D space centered on the display,
 * +x = screen RIGHT, +y = up, 1 unit ≈ the face width. The app maps face
 * units onto the visor (see LENOX_FACE_* in app.js), which is what keeps
 * the signals undistorted — the sim grid itself is anisotropic.
 */
const SIGNAL = Object.freeze({
  /** Eye center offset from the face center (screen right positive). */
  eyeHalfSep: 0.6,
  eyeY: 0.08,
  /**
   * Capsule half-width; half-height = eyeRx * eyeAspect. A tall bar is its own
   * worst reference frame: sliding it a little reads as nothing at all. The
   * shorter the capsule, the more legible the same travel becomes.
   */
  eyeRx: 0.145,
  eyeAspect: 1.7,
  /** Gaze travel of the signal set inside the display (on top of the head turn). */
  gazeTravelX: 0.115,
  gazeTravelY: 0.07,
  /**
   * The real visor has a concave lower edge. The mouth sits high and compact
   * so it never competes with that curve.
   */
  mouthY: -0.27,
  checkScale: 0.42,
  /** Speech slot: half-height at rest and at a fully articulated syllable. */
  slotClosed: 0.012,
  slotOpen: 0.075,
});

/** Face extents in face units — the app fits these into the visor display. */
export const LENOX_SIGNAL_FACE = Object.freeze({
  width: 2 * (SIGNAL.eyeHalfSep + SIGNAL.eyeRx),
  height: SIGNAL.eyeY + SIGNAL.eyeRx * SIGNAL.eyeAspect - (SIGNAL.mouthY - 0.12),
  eyeAspect: SIGNAL.eyeAspect,
});

/** Particle presence targets keep their own sim-space face (pre-wake shape). */
const FACE = Object.freeze({
  eyeHalfSep: 5.25,
  eyeY: 1.25,
  eyeRx: 4.15,
  eyeRy: 3.05,
  anchorR: 0.92,
  mouthY: -3.15,
});

/**
 * Pre-wake signal dust from the accepted lenox-proof path. Positions are
 * seeded once at boot; no settle target pulls the field into a floor pile.
 */
const DUST = Object.freeze({
  // 16k reads as a dense signal field; the density-size law below keeps the
  // individual shards fine enough to preserve depth and avoid a solid blob.
  particleScale: 0.7,
  particleOpacity: 0.7,
});

/**
 * Lifecycle fluid profiles. Pre-wake is the accepted lenox-proof free dust:
 * zero tethers, sparse rendering and local pointer response.
 */
const LIFECYCLE = Object.freeze({
  dormant: {
    noiseMul: 0.58,
    speedMul: 1.06,
    viscosityMul: 1.08,
    gravityMul: 0,
    settleWeight: 0,
    pointerInfluence: 2.5,
    energyMul: 1.14,
  },
  engaged: {
    noiseMul: 0.64,
    speedMul: 1.1,
    viscosityMul: 1.02,
    gravityMul: 0,
    settleWeight: 0,
    pointerInfluence: 2.85,
    energyMul: 1.2,
  },
  armed: {
    noiseMul: 0.52,
    speedMul: 1.03,
    viscosityMul: 1.12,
    gravityMul: 0,
    settleWeight: 0,
    pointerInfluence: 2.55,
    energyMul: 1.12,
  },
  // BIRTH: the matter keeps its energy through the wake. Cyan is kinetic, so
  // the implosion flares on its own — no authored flash, just speed.
  awakening: {
    noiseMul: 0.2,
    speedMul: 1.05,
    viscosityMul: 3.4,
    gravityMul: 0,
    settleWeight: 0.9, // overridden by the beat choreography
    pointerInfluence: 0, // overridden by the birth's pointer authority ramp
    energyMul: 1.3,
  },
  present: {
    noiseMul: 0.14,
    speedMul: 0.78,
    viscosityMul: 4.5,
    gravityMul: 0,
    settleWeight: 1.05,
    pointerInfluence: 0.1,
    energyMul: 1,
  },
});

const STATE_ALIASES = Object.freeze({
  idle: "dormant",
  attract: "engaged",
  waking: "awakening",
  alive: "present",
});

/**
 * THE BIRTH OF LENOX — the wake, as one continuous physical event (4.35s).
 *
 *   0.00 … implosionEnd  IMPLOSION   the free field loses its inertia and is
 *                                    WRAPPED inward. A purely radial pull
 *                                    discharges a rectangular field as four
 *                                    diagonal lobes — a folding screen, not
 *                                    matter organising itself. `settleSwirl`
 *                                    spirals those streams together instead.
 *                                    Speed alone flares the kinetic cyan.
 *   … shellEnd           SHELL WRAP  the mass lands on targets sampled from
 *                                    Lenox' REAL outer surfaces. Pointer
 *                                    authority reaches zero: shell lock.
 *   … shellHoldEnd       SHELL HOLD  nothing fades. The silhouette simply
 *                                    STANDS there — visor as a dark void, top
 *                                    cap and side modules legible. This is the
 *                                    frame the whole idea rests on, and it has
 *                                    to be allowed to breathe.
 *   … handoffEnd         ABSORPTION  the metal surfaces UNDER the silver skin
 *                                    while the skin is still there. Both are
 *                                    visible across most of the window: an
 *                                    exact inverse crossfade is mathematically
 *                                    clean and visually a CUT. A still frame
 *                                    from the middle must explain itself.
 *   … eyesOpenEnd        VISOR BOOT  the signals ignite with an overshoot — on
 *                                    a camera that has already landed.
 *   … acquireEnd         ACQUIRE     the gaze finds the actual cursor.
 *
 * Reduced motion compresses the event; the order never changes.
 */
const AWAKENING = Object.freeze({
  implosionEnd: 0.55,
  shellEnd: 1.85,
  shellHoldEnd: 2.3,
  handoffEnd: 2.95,
  eyesOpenEnd: 3.75,
  acquireEnd: 4.35,
  reducedTotal: 1.6,
});

/**
 * The eight display states of the character sheet. Every field is numeric so
 * the pose can be eased continuously — including `eyeArc`, which cross-fades
 * a capsule eye into an arc instead of swapping shapes on a frame boundary.
 *
 * Screen-space authoring: index 0 is the screen-LEFT eye. Rotation is
 * screen-CCW positive. All eight states stay cyan — amber is reserved for a
 * confirmed result (see the `confirm` reaction).
 *
 *   eyeArc      0 = vertical capsule · 1 = arc (∩)
 *   mouthCurve  >0 smile · <0 concern · ~0 flat line
 *   speak       0 = tone arc · 1 = articulation slot (procedural envelope)
 *   waves       listening wave brackets
 *   gazeAway    1 = the eyes break contact and drift (thinking)
 */
const EMOTIONS = Object.freeze({
  neutral: {
    eyeSy: [1, 1], eyeSx: [1, 1], eyeRotDeg: [0, 0], eyeArc: [0, 0],
    mouthCurve: 0.5, mouthWidth: 0.175, mouthOn: 1, mouthAlpha: 0.95,
    speak: 0, waves: 0, gazeAway: 0,
    tiltDeg: 0, accent: BRAND_ACCENT, noiseD: 0, speedD: 0,
  },
  // One eye lifts into an arc: the asymmetry IS the curiosity.
  curious: {
    eyeSy: [1, 1], eyeSx: [1, 1], eyeRotDeg: [0, 0], eyeArc: [1, 0],
    mouthCurve: 0.55, mouthWidth: 0.17, mouthOn: 1, mouthAlpha: 0.95,
    speak: 0, waves: 0, gazeAway: 0,
    tiltDeg: 3, accent: BRAND_ACCENT, noiseD: 0.12, speedD: 0.08,
  },
  pleased: {
    eyeSy: [1, 1], eyeSx: [1.06, 1.06], eyeRotDeg: [0, 0], eyeArc: [1, 1],
    mouthCurve: 0.85, mouthWidth: 0.23, mouthOn: 1, mouthAlpha: 1,
    speak: 0, waves: 0, gazeAway: 0,
    tiltDeg: 1.5, accent: BRAND_ACCENT, noiseD: 0.2, speedD: 0.12,
  },
  // Attentive-worried, NOT sad: the eyes stay wide open, only their inner
  // tops lean in and the mouth carries the concern.
  concerned: {
    eyeSy: [1.02, 1.02], eyeSx: [1, 1], eyeRotDeg: [-13, 13], eyeArc: [0, 0],
    mouthCurve: -0.6, mouthWidth: 0.16, mouthOn: 1, mouthAlpha: 0.95,
    speak: 0, waves: 0, gazeAway: 0,
    tiltDeg: -2, accent: BRAND_ACCENT, noiseD: -0.15, speedD: -0.1,
  },
  listening: {
    eyeSy: [1.06, 1.06], eyeSx: [1, 1], eyeRotDeg: [0, 0], eyeArc: [0, 0],
    mouthCurve: 0.42, mouthWidth: 0.15, mouthOn: 1, mouthAlpha: 0.85,
    speak: 0, waves: 1, gazeAway: 0,
    tiltDeg: 0, accent: BRAND_ACCENT, noiseD: -0.2, speedD: -0.12,
  },
  /**
   * THINKING is not a symbol, it is a behaviour: breaking eye contact.
   * Everyone looks AWAY to think — that single act reads as an inner process
   * more clearly than any icon can. The three dots that used to sit at mouth
   * height are gone for good: anything dotted in the mouth zone is read as
   * TEETH, which is why Lenox looked like a piranha.
   */
  thinking: {
    eyeSy: [0.86, 0.86], eyeSx: [1, 1], eyeRotDeg: [4, 4], eyeArc: [0, 0],
    mouthCurve: 0.04, mouthWidth: 0.1, mouthOn: 1, mouthAlpha: 0.22,
    speak: 0, waves: 0, gazeAway: 1,
    tiltDeg: 4, accent: BRAND_ACCENT, noiseD: -0.12, speedD: -0.08,
  },
  /**
   * SPEAKING drops the round mouth. A circle opening and closing on a steady
   * beat is the exact signature of a fish breathing — the problem was never
   * the shape, it was the rhythm. Speech is an irregular articulation slot
   * with pauses; the envelope lives in updateSpeech().
   */
  speaking: {
    eyeSy: [1, 1], eyeSx: [1, 1], eyeRotDeg: [0, 0], eyeArc: [0, 0],
    mouthCurve: 0.1, mouthWidth: 0.125, mouthOn: 1, mouthAlpha: 1,
    speak: 1, waves: 0, gazeAway: 0,
    tiltDeg: 0, accent: BRAND_ACCENT, noiseD: 0.1, speedD: 0.06,
  },
  // Focused, not aggressive: a mild narrowing plus a quiet confident mouth.
  // Steeper angles or a downturned mouth immediately read as anger.
  acting: {
    eyeSy: [0.76, 0.76], eyeSx: [1.04, 1.04], eyeRotDeg: [15, -15], eyeArc: [0, 0],
    mouthCurve: 0.3, mouthWidth: 0.13, mouthOn: 1, mouthAlpha: 1,
    speak: 0, waves: 0, gazeAway: 0,
    tiltDeg: 0, accent: BRAND_ACCENT, noiseD: 0.25, speedD: 0.18,
  },
});

/**
 * Behaviour profiles coordinate the existing animation channels. `arousal`
 * and `attention` are shared signals; the remaining fields preserve each
 * state's authored character instead of reducing expression to two sliders.
 */
const MOTION_PROFILES = Object.freeze({
  neutral: {
    arousal: 0.38, attention: 0.7,
    breath: 0.92, blink: 0.95, saccade: 0.82, response: 0.92,
    cursorFollow: 1, headFollow: 1, headLag: 1, wander: 0.08, idle: 0.85,
  },
  curious: {
    arousal: 0.58, attention: 0.9,
    breath: 1.05, blink: 1.02, saccade: 1.18, response: 1.18,
    cursorFollow: 1, headFollow: 1.04, headLag: 1.08, wander: 0.16, idle: 1,
  },
  pleased: {
    arousal: 0.48, attention: 0.72,
    breath: 1, blink: 0.9, saccade: 0.72, response: 0.94,
    cursorFollow: 0.94, headFollow: 0.92, headLag: 0.92, wander: 0.08, idle: 0.8,
  },
  concerned: {
    arousal: 0.66, attention: 0.86,
    breath: 1.08, blink: 1.08, saccade: 0.68, response: 1.08,
    cursorFollow: 0.9, headFollow: 0.9, headLag: 0.88, wander: 0.05, idle: 0.62,
  },
  listening: {
    arousal: 0.3, attention: 0.98,
    breath: 0.82, blink: 0.82, saccade: 0.16, response: 0.78,
    cursorFollow: 0.96, headFollow: 0.98, headLag: 0.82, wander: 0, idle: 0.28,
  },
  thinking: {
    arousal: 0.42, attention: 0.64,
    breath: 0.88, blink: 0.72, saccade: 0.24, response: 0.7,
    cursorFollow: 0.08, headFollow: 0.72, headLag: 0.52, wander: 1, idle: 0.34,
  },
  speaking: {
    arousal: 0.64, attention: 0.84,
    breath: 1.08, blink: 0.9, saccade: 0.48, response: 1.2,
    cursorFollow: 0.9, headFollow: 0.94, headLag: 1, wander: 0.03, idle: 0.58,
  },
  acting: {
    arousal: 0.46, attention: 1,
    breath: 0.68, blink: 0.3, saccade: 0.04, response: 1.06,
    cursorFollow: 0.16, headFollow: 0.34, headLag: 0.64, wander: 0, idle: 0.06,
  },
});

const REACTIONS = Object.freeze({
  laugh: { duration: 1.6 },
  startle: { duration: 0.85 },
  tired: { duration: 5.5 },
  /** Confirmed / completed / success — the ONLY amber signal. */
  confirm: { duration: 1.9 },
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

/**
 * Blinks are the cheapest life there is — and a metronome blink is worse than
 * none, because a perfectly regular interval is exactly what a machine does.
 * Real blinks cluster: a long gap, then sometimes two in quick succession.
 */
const BLINK = Object.freeze({
  doubleChance: 0.22,
  doubleGapSec: 0.19,
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

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const THREE_LERP = (a, b, t) => a + (b - a) * t;
const clampRange = (v, m) => Math.max(-m, Math.min(m, v));
const smooth01 = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

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
    // Small backing knots BEHIND the rig anchors (one pupil signal).
    nodes: [
      { x: PRESENCE_CENTER.x - FACE.eyeHalfSep * s, y: PRESENCE_CENTER.y + FACE.eyeY, r: 1.15 * s },
      { x: PRESENCE_CENTER.x + FACE.eyeHalfSep * s, y: PRESENCE_CENTER.y + FACE.eyeY, r: 0.95 * s },
    ],
    contourLift: 1.02,
    scale: s,
    particleScale:
      tune.particleScale ??
      (typeof window !== "undefined" && window.innerWidth < 768 ? 0.52 : 0.76),
    particleOpacity: tune.particleOpacity ?? 0.92,
    gazeStrength: tune.gazeStrength ?? 1,
    focalSignalStrength: tune.focalSignalStrength ?? 0.2,
    emotionColors: tune.emotionColors === true,
    // Session 1.5 stability gate: idle motion ships OFF; each source
    // returns individually once the sovereign baseline is accepted.
    floatAmp: tune.floatAmp ?? 0,
    tremorAmp: tune.tremorAmp ?? 0,
    breatheDepth: tune.breatheDepth ?? 0,
    presentNoiseMul: tune.presentNoiseMul ?? 0,
    // Density gate: desktop defaults to 16384; the device budget still caps
    // it (mobile). Count changes apply only BEFORE the awakening — once
    // presence targets are authored the count is locked (A/B needs a reset).
    particleCount: tune.particleCount ?? LENOX_DESKTOP_COUNT,
    // Pre-wake matter look (heavy reservoir, smaller shards at high count).
    dustScale: tune.dustScale ?? DUST.particleScale,
    dustOpacity: tune.dustOpacity ?? DUST.particleOpacity,
    // Critical settle (1.5B): exp(-rate·dt) on the settled mass. Start
    // hypotheses — near-critical for the body, lively for the gaze focals.
    settleDampingShell: tune.settleDampingShell ?? 12,
    settleDampingFocal: tune.settleDampingFocal ?? 3.5,
    // Silver-material channel (Session 1) — start hypotheses, tuned visually.
    metalness: tune.metalness ?? 0.85,
    roughness: tune.roughness ?? 0.3,
    envIntensity: tune.envIntensity ?? 1.35,
    silverGain: tune.silverGain ?? 1,
    keyIntensity: tune.keyIntensity ?? 2.4,
    hemiIntensity: tune.hemiIntensity ?? 0.3,
    // World +x = screen LEFT (camera looks from -z toward +z).
    keyX: tune.keyX ?? 1.35,
    keyY: tune.keyY ?? 0.62,
    keyZ: tune.keyZ ?? -0.35,
  };
}

function poseFromEmotion(e) {
  return {
    eyeSyL: e.eyeSy[0], eyeSyR: e.eyeSy[1],
    eyeSxL: e.eyeSx[0], eyeSxR: e.eyeSx[1],
    eyeRotL: e.eyeRotDeg[0] * DEG, eyeRotR: e.eyeRotDeg[1] * DEG,
    eyeArcL: e.eyeArc[0], eyeArcR: e.eyeArc[1],
    mouthCurve: e.mouthCurve, mouthWidth: e.mouthWidth,
    mouthOn: e.mouthOn,
    mouthAlpha: e.mouthAlpha,
    speak: e.speak,
    waves: e.waves,
    gazeAway: e.gazeAway,
    tilt: e.tiltDeg * DEG,
  };
}

export class LenoxEyesDrive {
  constructor(options = {}) {
    this.reducedMotion = !!options.reducedMotion;
    this.requestedState = "dormant";
    this.activeState = "dormant";
    this.stateElapsed = 0;
    this.current = { ...LIFECYCLE.dormant };
    this.authoredShape = null; // "shell" while awake, else null
    this.breathePhase = 0;
    this.baseActualSize = null;
    this.baseRestDensity = null;
    this.baseParticleBudget = null;
    this.lockedParticleCount = null;
    this.densitySizeMul = 1;
    this.calmT = 0; // eased 0→1 into present; gates idle noise down
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

    // Blink (rig-owned).
    this.blinkPhase = "none";
    this.blinkTimer =
      BLINK.intervalMinSec +
      Math.random() * (BLINK.intervalMaxSec - BLINK.intervalMinSec);
    this.blinkT = 0;
    this.blinkScale = 1;

    // Affect + reaction.
    this.emotion = "neutral";
    this.previousEmotion = "neutral";
    this.emotionEntryT = 0;
    this.arousal = MOTION_PROFILES.neutral.arousal;
    this.attention = MOTION_PROFILES.neutral.attention;
    this.motionProfile = MOTION_PROFILES.neutral;
    this.pose = poseFromEmotion(EMOTIONS.neutral);
    this.accent = BRAND_ACCENT;
    this.reaction = null;
    /** Amber confirm mark (0..1); set by the `confirm` reaction only. */
    this.confirmT = 0;
    /**
     * The void medium's visibility. It is 0 through play, through the whole
     * birth and through the visor boot: the wake must land on pure black, and
     * nothing may compete with the eyes igniting. Only once Lenox is live and
     * looking at you does the room quietly become perceptible.
     */

    // Procedural speech: an irregular articulation envelope, never a sine.
    this.speech = { amp: 0, target: 0, hold: 0, emphasis: 0, nodT: -1 };
    // Idle life.
    this.blinkQueued = false;
    this.saccadeX = 0;
    this.saccadeY = 0;
    this.saccadeGoalX = 0;
    this.saccadeGoalY = 0;
    this.saccadeTimer = 1.2;
    this.ticTimer = 6 + Math.random() * 8;
    this.ticSide = 0;
    this.ticT = 0;
    this.wanderPhase = Math.random() * 100;
    this.headLookX = 0;
    this.headLookY = 0;
    this.gazeTurnMotion = 0;
    this.headTurnMotion = 0;
    this.taskFocusX = 0;
    this.taskFocusY = 0;

    this.spec = null;
    this.rigPresence = 0;
  }

  setState(state) {
    const canonical = STATE_ALIASES[state] ?? state;
    if (!LIFECYCLE[canonical] || canonical === this.requestedState) return;
    this.requestedState = canonical;
  }

  setEmotion(emotion) {
    if (!EMOTIONS[emotion] || emotion === this.emotion) return;
    this.previousEmotion = this.emotion;
    this.emotion = emotion;
    this.emotionEntryT = 0;
    if (emotion === "listening" || emotion === "acting") {
      this.saccadeGoalX = 0;
      this.saccadeGoalY = 0;
    }
    if (emotion === "acting") {
      this.taskFocusX = this.gazeX;
      this.taskFocusY = this.gazeY;
    }
    if (emotion === "speaking") {
      this.speech.amp = 0;
      this.speech.target = 0.32;
      this.speech.hold = 0.11;
      this.speech.emphasis = 0;
      this.speech.nodT = -1;
    }
  }

  triggerReaction(name) {
    if (REACTIONS[name]) this.reaction = { name, t: 0 };
  }

  setGazeTarget(x, y) {
    const nx = Math.max(-0.5, Math.min(0.5, x));
    const ny = Math.max(-0.5, Math.min(0.5, y));
    if (nx !== this.pointerX || ny !== this.pointerY) {
      this.lastPointerMoveAt = this.clock;
    }
    this.pointerX = nx;
    this.pointerY = ny;
  }

  awakeningBeats() {
    if (!this.reducedMotion) return AWAKENING;
    const f = AWAKENING.reducedTotal / AWAKENING.acquireEnd;
    return {
      implosionEnd: AWAKENING.implosionEnd * f,
      shellEnd: AWAKENING.shellEnd * f,
      shellHoldEnd: AWAKENING.shellHoldEnd * f,
      handoffEnd: AWAKENING.handoffEnd * f,
      eyesOpenEnd: AWAKENING.eyesOpenEnd * f,
      acquireEnd: AWAKENING.reducedTotal,
    };
  }


  updateBlink(dt, motion) {
    const speechEmphasis =
      this.emotion === "speaking" && this.speech.emphasis > 0.08;
    if (
      !speechEmphasis &&
      typeof globalThis !== "undefined" &&
      globalThis.__LENOX_BLINK__
    ) {
      globalThis.__LENOX_BLINK__ = false;
      if (this.blinkPhase === "none") {
        this.blinkPhase = "closing";
        this.blinkT = 0;
      }
    }
    if (this.activeState !== "present") {
      this.blinkScale = 1;
      return;
    }
    if (this.blinkPhase === "none") {
      if (speechEmphasis) {
        this.blinkScale = 1;
        return;
      }
      const blinkRate =
        (0.65 + this.arousal * 0.9) * motion.blink;
      this.blinkTimer -= dt * blinkRate;
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
      this.blinkScale =
        BLINK.closedScale + (1 - BLINK.closedScale) * (1 - Math.pow(1 - t, 3));
      if (t >= 1) {
        this.blinkPhase = "none";
        this.blinkScale = 1;
        if (this.blinkQueued) {
          this.blinkQueued = false;
          this.blinkTimer = BLINK.doubleGapSec;
        } else {
          this.blinkQueued = Math.random() < BLINK.doubleChance;
          this.blinkTimer =
            BLINK.intervalMinSec +
            Math.random() * (BLINK.intervalMaxSec - BLINK.intervalMinSec);
        }
      }
    }
  }

  updateGaze(dt, motion) {
    const pointerIdle = this.clock - this.lastPointerMoveAt > GAZE.idleReturnSec;
    const cursorLock = motion.cursorFollow * (0.42 + this.attention * 0.58);
    const pointerGoalX = pointerIdle ? 0 : this.pointerX;
    const pointerGoalY = pointerIdle ? 0 : this.pointerY;
    const taskLock = this.emotion === "acting" ? 0.88 : 0;
    const goalX =
      this.taskFocusX * taskLock + pointerGoalX * cursorLock * (1 - taskLock);
    const goalY =
      this.taskFocusY * taskLock + pointerGoalY * cursorLock * (1 - taskLock);
    const dx = goalX - this.gazeX;
    const dy = goalY - this.gazeY;
    const previousX = this.gazeX;
    const previousY = this.gazeY;
    const response = (0.72 + this.arousal * 0.72) * motion.response;
    if (Math.sqrt(dx * dx + dy * dy) > GAZE.saccadeThreshold) {
      const snap = 1 - Math.pow(1 - GAZE.snapEase, response);
      this.gazeX += dx * snap;
      this.gazeY += dy * snap;
      this.trembleX = 0;
      this.trembleY = 0;
    } else {
      const settle = 1 - Math.pow(1 - GAZE.settleEase, response);
      this.gazeX += dx * settle;
      this.gazeY += dy * settle;
      // Micro-tremor only while present (never pre-wake). Session 1.5:
      // ships OFF (tremorAmp 0) — sovereignty first, micro-life last.
      const tremorAmp = GAZE.trembleAmp * (this.spec?.tremorAmp ?? 0);
      if (this.activeState === "present" && tremorAmp > 0) {
        this.trembleTimer -= dt;
        if (this.trembleTimer <= 0) {
          this.trembleTimer =
            GAZE.trembleIntervalSec * (0.7 + Math.random() * 0.6);
          this.trembleX = (Math.random() - 0.5) * 2 * tremorAmp;
          this.trembleY = (Math.random() - 0.5) * 2 * tremorAmp;
        }
      } else {
        this.trembleX = 0;
        this.trembleY = 0;
      }
    }
    this.gazeTurnMotion =
      Math.hypot(this.gazeX - previousX, this.gazeY - previousY) /
      Math.max(dt, 1 / 120);
  }

  /**
   * Transient overlays on top of the eased state pose. `confirm` is the only
   * one that leaves the cyan grammar: the display clears and an amber
   * checkmark resolves — the same mark that is the Lenox sigil. It is never a
   * resting face.
   */
  /**
   * Procedural speech envelope. Speech is bursts and pauses, not a waveform:
   * a steady periodic mouth is what made the old ring read as a fish gulping.
   * Openings snap, closings trail, pauses land at random, and the occasional
   * stressed syllable opens wide and lasts longer. No sine anywhere.
   */
  updateSpeech(dt, active) {
    const sp = this.speech;
    sp.emphasis = Math.max(0, sp.emphasis - dt * 3.4);
    if (sp.nodT >= 0) sp.nodT += dt;

    if (!active) {
      sp.amp += (0 - sp.amp) * (1 - Math.exp(-Math.max(dt, 0) / 0.09));
      sp.target = 0;
      sp.hold = 0;
      sp.nodT = -1;
      return;
    }

    // Entry wake: one small opening proves the channel is live before the
    // irregular articulation begins.
    if (this.emotionEntryT < 0.11) {
      sp.target = 0.32;
      sp.hold = Math.max(sp.hold, 0.11 - this.emotionEntryT);
    }

    sp.hold -= dt;
    if (sp.hold <= 0) {
      const roll = Math.random();
      if (roll < 0.2) {
        // A pause. Speech without silence is noise.
        sp.target = 0;
        sp.hold = 0.13 + Math.random() * 0.3;
      } else if (roll < 0.32) {
        if (this.blinkPhase === "none") {
          // Emphasis is its own authored shape and owns eyes/head briefly.
          sp.target = 0.94;
          sp.hold = 0.13 + Math.random() * 0.1;
          sp.emphasis = 1;
          sp.nodT = 0;
        } else {
          sp.target = 0.58;
          sp.hold = 0.08 + Math.random() * 0.07;
        }
      } else {
        // Two reduced articulation shapes: narrow and medium.
        sp.target = roll < 0.64 ? 0.3 : 0.58;
        sp.hold = 0.05 + Math.random() * 0.09;
      }
    }

    // Mouths open faster than they close.
    const tau = sp.target > sp.amp ? 0.032 : 0.062;
    sp.amp += (sp.target - sp.amp) * (1 - Math.exp(-Math.max(dt, 0) / tau));
  }

  /**
   * Idle life. Everything here is small and irregular on purpose: a face that
   * holds perfectly still between states reads as dead, and one that jitters
   * reads as broken. Cursor tracking always stays the dominant signal.
   */
  updateIdle(dt, profile) {
    const present = this.activeState === "present";
    const motionScale = this.reducedMotion ? 0.3 : 1;
    const idleStrength = profile.idle * motionScale;
    const saccadeRate = (0.45 + this.arousal * 1.1) * profile.saccade;
    const headTurning = Math.max(this.gazeTurnMotion, this.headTurnMotion) > 0.18;

    // Micro-saccades: the eye never rests exactly on target, it lands near it
    // and re-aims. Rare, fast, tiny — a saccade, not a tremor.
    if (present) {
      this.saccadeTimer -= dt * saccadeRate;
      if (this.saccadeTimer <= 0 && !headTurning) {
        this.saccadeTimer = 0.9 + Math.random() * 2.2;
        const wakefulness = 0.55 + this.attention * 0.45;
        this.saccadeGoalX =
          (Math.random() - 0.5) * 0.05 * idleStrength * wakefulness;
        this.saccadeGoalY =
          (Math.random() - 0.5) * 0.035 * idleStrength * wakefulness;
      }
      if (headTurning || profile.idle < 0.3) {
        this.saccadeGoalX *= Math.exp(-dt * 8);
        this.saccadeGoalY *= Math.exp(-dt * 8);
      }
      const k = 1 - Math.exp(-Math.max(dt, 0) / 0.06);
      this.saccadeX += (this.saccadeGoalX - this.saccadeX) * k;
      this.saccadeY += (this.saccadeGoalY - this.saccadeY) * k;
    } else {
      this.saccadeX = 0;
      this.saccadeY = 0;
    }

    // A rare, brief asymmetry tic. Permanent asymmetry looks like a defect;
    // a transient one looks like a thought crossing.
    this.ticT = Math.max(0, this.ticT - dt);
    if (present && profile.idle > 0.3) {
      this.ticTimer -= dt * (0.55 + this.arousal * 0.8) * profile.idle;
      if (this.ticTimer <= 0) {
        this.ticTimer = 7 + Math.random() * 9;
        this.ticSide = Math.random() < 0.5 ? 0 : 1;
        this.ticT = 0.55 * idleStrength;
      }
    }
  }

  applyReaction(target, dt) {
    const head = { bounceY: 0, bounceX: 0, tiltAdd: 0, squash: 1 };
    this.confirmT = 0;
    if (!this.reaction || this.activeState !== "present") return head;
    const { name, t } = this.reaction;
    const motion = this.reducedMotion ? 0.35 : 1;

    if (name === "laugh") {
      target.eyeArcL = 1;
      target.eyeArcR = 1;
      target.mouthCurve = 0.95;
      target.mouthWidth = 0.19 + Math.sin(t * 18) * 0.012 * motion;
      target.speak = 0;
      target.mouthOn = 1;
      target.mouthAlpha = 1;
      head.bounceY = Math.abs(Math.sin(t * 10)) * 0.8 * motion;
      head.tiltAdd = Math.sin(t * 5) * 2.5 * DEG * motion;
      head.squash = 1 - Math.abs(Math.sin(t * 10)) * 0.05 * motion;
    } else if (name === "startle") {
      const k = Math.exp(-t * 4);
      target.eyeSyL = 1.42;
      target.eyeSyR = 1.42;
      target.eyeSxL = 1.12;
      target.eyeSxR = 1.12;
      target.eyeArcL = 0;
      target.eyeArcR = 0;
      // The slot snaps fully open — a caught breath, not a syllable.
      target.speak = 1;
      target.mouthWidth = 0.105;
      target.mouthOn = 1;
      target.mouthAlpha = 1;
      head.bounceY = k * 1.4 * motion;
      head.squash = 1 + k * 0.08 * motion;
    } else if (name === "tired") {
      const cyc = t / REACTIONS.tired.duration;
      if (cyc < 0.75) {
        const droop = clamp01(cyc / 0.75);
        target.eyeSyL = 1 - droop * 0.72;
        target.eyeSyR = 1 - droop * 0.72;
        target.mouthCurve = 0.02;
        target.mouthWidth = 0.1;
        target.mouthOn = 1;
        target.mouthAlpha = 0.5;
        head.bounceY = -droop * 1.3 * motion;
        head.tiltAdd = droop * 4 * DEG * motion;
      } else {
        target.eyeSyL = 1.25;
        target.eyeSyR = 1.25;
        head.bounceY = 0.5 * motion;
      }
    } else if (name === "confirm") {
      // Fast in, hold, soft out — the mark lands, it does not linger.
      // confirmT drives the amber mark AND fades the cyan signals out. It is
      // applied directly (not through the pose ease) so the mark lands crisp.
      const d = REACTIONS.confirm.duration;
      this.confirmT = smooth01(t / 0.28) * (1 - smooth01((t - (d - 0.5)) / 0.5));
      target.eyeArcL = 1;
      target.eyeArcR = 1;
      target.mouthCurve = 0.85;
      head.bounceY = Math.sin(smooth01(t / 0.28) * Math.PI) * 0.55 * motion;
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
    // Capture the device budget before the Lenox cap ever clamps it, so a
    // live particleCount change can move both up and down.
    if (this.baseParticleBudget === null && Number.isFinite(rt.particles)) {
      this.baseParticleBudget = rt.particles;
    }

    // Re-resolved every frame so __LENOX_TUNE__ knobs apply live.
    this.spec = resolvePresenceSpec();
    const spec = this.spec;

    // Density gate (Session 1.5B): packed-volume equilibrium is
    // count / restDensity, so rest density scales with the active count to
    // keep the authored silhouette constant; shard size compensates by cbrt
    // so the mass reads equally dense, just finer-grained. Count, density,
    // size and presence targets belong together: once the presence is
    // authored the count is LOCKED (a mid-present switch would activate
    // particles still sitting at their boot dust positions).
    const desiredCount = Math.min(
      Math.max(Math.floor(spec.particleCount) || LENOX_DESKTOP_COUNT, 1024),
      this.baseParticleBudget ?? LENOX_DESKTOP_COUNT,
    );
    const authoringNeedsStableBudget =
      this.requestedState === "awakening" ||
      this.activeState === "awakening" ||
      this.activeState === "present";
    const formationCount = Math.min(desiredCount, LENOX_CHARACTER_COUNT);
    const activeCap =
      this.lockedParticleCount ??
      (authoringNeedsStableBudget ? formationCount : desiredCount);
    rt.particles = activeCap;
    if (Number.isFinite(this.baseRestDensity)) {
      rt.restDensity =
        this.baseRestDensity *
        LENOX_REST_DENSITY_MUL *
        (activeCap / LENOX_DENSITY_REF);
    }
    this.densitySizeMul = Math.cbrt(LENOX_DENSITY_REF / activeCap);

    // Lifecycle transitions. Pre-wake has no settle target; wake replaces
    // the free dust with authored presence targets.
    // PHYSICAL LENOX: the same matter forms the presence — targets are
    // authored once at wake, the mass flows there under its own energy.
    if (this.requestedState !== this.activeState) {
      // Critical settle (1.5B): zero residual momentum exactly once at the
      // awakening→present hand-off so the spring never pendulates.
      if (this.activeState === "awakening" && this.requestedState === "present") {
        app.mlsMpmSim?.scheduleVelocityZero?.();
      }
      this.activeState = this.requestedState;
      this.stateElapsed = 0;
    }
    this.stateElapsed += Math.max(dt, 0);

    const beats = this.awakeningBeats();
    const inLenoxShape =
      this.activeState === "awakening" || this.activeState === "present";
    if (inLenoxShape) {
      if (this.authoredShape !== "shell") {
        // Lock count/density/size/targets as one configuration per wake.
        this.lockedParticleCount = activeCap;
        // The mass collapses into Lenox' REAL silhouette, sampled from the
        // GLB's outer surfaces. The legacy presence targets authored a face
        // out of particles — a ghost from before he had a body — and are only
        // used if the vessel has not finished loading.
        const shell = app.buildLenoxShellTargets?.(activeCap);
        if (!shell) {
          app.mlsMpmSim?.buildLenoxPresenceTargets?.(spec, {
            particleCount: activeCap,
          });
        }
        this.authoredShape = "shell";
      }
    } else {
      this.authoredShape = null;
      this.lockedParticleCount = null;
    }

    if (this.activeState === "awakening" && this.stateElapsed >= beats.acquireEnd) {
      this.requestedState = "present";
    }

    // Fluid profile ease.
    const lifecycleProfile = LIFECYCLE[this.activeState];
    const k = 1 - Math.exp(-Math.max(dt, 0) / EASE_TAU_SEC);
    const cur = this.current;
    for (const key of Object.keys(cur)) {
      cur[key] += (lifecycleProfile[key] - cur[key]) * k;
    }
    // Sovereign-present gate: eases toward 1 in present and scales the
    // remaining idle noise down to presentNoiseMul (default 0 = still).
    this.calmT += ((this.activeState === "present" ? 1 : 0) - this.calmT) * k;

    this.emotionEntryT += Math.max(dt, 0);
    const profileTarget =
      this.activeState === "present"
        ? (MOTION_PROFILES[this.emotion] ?? MOTION_PROFILES.neutral)
        : MOTION_PROFILES.neutral;
    const coordinationK =
      1 - Math.exp(-Math.max(dt, 0) / Math.max(0.12, 0.28 / profileTarget.response));
    this.arousal += (profileTarget.arousal - this.arousal) * coordinationK;
    this.attention += (profileTarget.attention - this.attention) * coordinationK;

    // Listening visibly sheds motion on entry instead of snapping into stillness.
    let motionProfile = profileTarget;
    if (this.emotion === "listening" && this.activeState === "present") {
      const settle = smooth01(this.emotionEntryT / 0.5);
      motionProfile = {
        ...profileTarget,
        idle: 1 + (profileTarget.idle - 1) * settle,
        saccade: 1 + (profileTarget.saccade - 1) * settle,
      };
    }
    this.motionProfile = motionProfile;

    const startled = this.reaction?.name === "startle";
    this.updateSpeech(
      dt,
      this.activeState === "present" && this.emotion === "speaking" && !startled,
    );
    this.updateBlink(dt, motionProfile);
    this.updateGaze(dt, motionProfile);
    this.updateIdle(dt, motionProfile);

    // Affect pose (present only).
    const emotionDef =
      this.activeState === "present"
        ? (EMOTIONS[this.emotion] ?? EMOTIONS.neutral)
        : EMOTIONS.neutral;
    const target = poseFromEmotion(emotionDef);
    const head = this.applyReaction(target, dt);
    const reactionSpeed = (0.72 + this.arousal * 0.72) * motionProfile.response;
    const pk = 1 - Math.exp(-Math.max(dt, 0) * reactionSpeed / POSE_TAU_SEC);
    for (const key of Object.keys(this.pose)) {
      this.pose[key] += (target[key] - this.pose[key]) * pk;
    }
    this.accent = spec.emotionColors ? emotionDef.accent : BRAND_ACCENT;

    const motionScale = this.reducedMotion ? 0.4 : 1;
    const breathRate = (0.72 + this.arousal * 0.72) * motionProfile.breath;
    this.breathePhase += dt * BREATHE_RATE_HZ * breathRate * Math.PI * 2;
    const breathe =
      this.activeState === "present"
        ? 1 +
          Math.sin(this.breathePhase) *
            spec.breatheDepth *
            motionProfile.breath *
            motionScale
        : 1;

    // Awakening timeline envelopes.
    let awakeningRig = 0;
    let awakeEyeScale = 1;
    let acquireT = 1;
    let bodyT = this.activeState === "present" ? 1 : 0;
    let skinT = this.activeState === "present" ? 0 : 1;
    if (this.activeState === "awakening") {
      const t = this.stateElapsed;
      const handoff = smooth01(
        (t - beats.shellHoldEnd) /
          Math.max(beats.handoffEnd - beats.shellHoldEnd, 0.01),
      );

      // ABSORPTION, not a crossfade. The metal surfaces EARLY and fast — it is
      // already there under the skin — then waits. The silver skin holds, and
      // only lets go late. Across most of the window both are on screen at
      // once, which is the only way an eye reads a transformation instead of a
      // swap. Two inverse curves would be clean and would look like a cut.
      bodyT = Math.min(1, Math.pow(handoff, 0.55) * 1.08);
      skinT = 1 - Math.pow(handoff, 2.6);

      // Identity comes after matter: the visor stays dark until the body is
      // fully there, then the rig boots inside it.
      awakeningRig = smooth01(
        (t - beats.handoffEnd) /
          Math.max(beats.eyesOpenEnd - beats.handoffEnd, 0.01),
      );
      if (t < beats.handoffEnd) {
        awakeEyeScale = 0.04;
      } else if (t < beats.eyesOpenEnd) {
        // Ignition overshoots and settles — a switch that snaps, not a fade.
        const ot = smooth01(
          (t - beats.handoffEnd) /
            Math.max(beats.eyesOpenEnd - beats.handoffEnd, 0.01),
        );
        awakeEyeScale = 0.04 + (1.18 - 0.04) * ot - 0.18 * ot * ot;
      } else {
        awakeEyeScale = 1;
      }
      acquireT = smooth01(
        (t - beats.eyesOpenEnd) /
          Math.max(beats.acquireEnd - beats.eyesOpenEnd, 0.01),
      );
    }

    const gazeOn =
      this.activeState === "present" ? 1 : this.activeState === "awakening" ? acquireT : 0;

    // Fluid runtime.
    rt.noise =
      SOURCE_PLAY_BASE.noise *
      cur.noiseMul *
      (1 + emotionDef.noiseD * gazeOn * motionScale) *
      (1 - this.calmT * (1 - spec.presentNoiseMul));
    rt.speed = SOURCE_PLAY_BASE.speed * cur.speedMul * (1 + emotionDef.speedD * gazeOn);
    rt.dynamicViscosity = SOURCE_PLAY_BASE.dynamicViscosity * cur.viscosityMul;
    rt.gravity = SOURCE_PLAY_BASE.gravity * cur.gravityMul;

    const pointerNowX = this.gazeX + this.trembleX;
    const pointerNowY = this.gazeY + this.trembleY;
    // Focal particles obey the same travel clamp as the rig anchors.
    const nodeMaxTx = FACE.eyeRx * GAZE.travelFracX * spec.scale * 0.95;
    const nodeMaxTy = FACE.eyeRy * GAZE.travelFracY * spec.scale * 0.95;
    const gazeScreenX =
      clampRange(pointerNowX * 2 * 2.0 * spec.gazeStrength, nodeMaxTx) * gazeOn;
    const gazeSimY =
      clampRange(pointerNowY * 2 * 1.3 * spec.gazeStrength, nodeMaxTy) * gazeOn;

    rt.settleWeight = cur.settleWeight * breathe;
    rt.settleSwirl = 0;
    if (this.activeState === "awakening") {
      const t = this.stateElapsed;
      if (t < beats.implosionEnd) {
        // IMPLOSION: one hard, undamped pull inward. The recoil is visible
        // energy, and speed alone makes the silver flare cyan.
        rt.settleWeight =
          2.6 * smooth01(t / Math.max(beats.implosionEnd * 0.45, 0.01));
      } else if (t < beats.shellEnd) {
        // SHELL WRAP: the mass tightens onto the sampled surface, damped.
        rt.settleWeight = 1.35;
      } else {
        // HOLD and beyond: locked hard onto the silhouette. It must not drift
        // while the visitor is reading it.
        rt.settleWeight = 1.6;
      }

      // The swirl wraps the collapse and unwinds before the lock, so the shell
      // lands still — a spiral that survives into the hold would smear it.
      rt.settleSwirl =
        1.9 *
        smooth01(t / Math.max(beats.implosionEnd * 0.5, 0.01)) *
        (1 -
          smooth01(
            (t - beats.implosionEnd) /
              Math.max(beats.shellEnd - beats.implosionEnd, 0.01),
          ));
    }
    rt.settleOffset.set(-gazeScreenX, gazeSimY, 0);

    const floatOn =
      (this.activeState === "present" ? spec.floatAmp : 0) * motionScale;
    const bobX = Math.sin(this.clock * FLOAT.xRateHz * Math.PI * 2) * FLOAT.xAmp * floatOn;
    const bobY =
      Math.sin(this.clock * FLOAT.yRateHz * Math.PI * 2) * FLOAT.yAmp * floatOn +
      head.bounceY;
    rt.settleBob.set(bobX, bobY, 0);
    // The rig owns blink; the particle field is never squashed.
    rt.settleSquashT = 1;
    rt.settleSquashCenter = PRESENCE_CENTER.y;
    // Screen-edge ricochet: lively while playing — the field bounces as a
    // mass. Off from the wake onward (formation and present never rebound).
    rt.wallRestitution =
      this.activeState === "present" || this.activeState === "awakening"
        ? 0
        : this.reducedMotion
          ? 0.18
          : 0.78;
    // Critical settle damping: OFF during the impulse (the recoil must be
    // visible energy), ramping in through the glide, full in present.
    const dampOn =
      this.activeState === "present"
        ? 1
        : this.activeState === "awakening"
          ? this.stateElapsed < beats.implosionEnd
            ? 0
            : 0.85 *
              smooth01(
                (this.stateElapsed - beats.implosionEnd) /
                  Math.max(beats.shellEnd - beats.implosionEnd, 0.01),
              )
          : 0;
    rt.settleDampingShell = spec.settleDampingShell * dampOn;
    rt.settleDampingFocal = spec.settleDampingFocal * dampOn;

    /**
     * Signature transform (Rescue): two beats on his own matter, derived from
     * THE one transform scalar (`app.lenoxTransformP`, pushed by the GSAP
     * clock). The drive used to run its own dt-clock here — two clocks for
     * one synced moment drift on any frame hitch (peer-review trap #2), so
     * the internal clock is gone.
     *   GATHER (p 0–0.26)  — the field tightens onto him; churn dies down.
     *   IGNITE (p 0.26–0.40) — one undamped kick: damping drops, noise and
     *     speed spike, and speed alone makes the silver flare cyan.
     * Applied AFTER the state law so it modulates final values; `present` only.
     */
    const tp = app.lenoxTransformP ?? 0;
    if (tp > 0 && tp < 1 && this.activeState === "present") {
      if (tp < 0.26) {
        const g = smooth01(tp / 0.26);
        rt.settleWeight *= 1 + 1.7 * g;
        rt.noise *= 1 - 0.75 * g;
        rt.speed *= 1 - 0.22 * g;
      } else if (tp < 0.4) {
        const kick = Math.sin(Math.min((tp - 0.26) / 0.14, 1) * Math.PI);
        rt.settleDampingShell *= 1 - 0.9 * kick;
        rt.settleDampingFocal *= 1 - 0.6 * kick;
        rt.noise *= 1 + 2.6 * kick;
        rt.speed *= 1 + 0.95 * kick;
      }
    }

    rt.lenoxEnergyMul = cur.energyMul;
    rt.lenoxFocalBoost = spec.focalSignalStrength;

    const preWake =
      this.activeState === "dormant" ||
      this.activeState === "engaged" ||
      this.activeState === "armed";
    if (preWake) {
      rt.settleDampingShell = 0;
      rt.settleDampingFocal = 0;
    }
    // The physical field owns Play. Once the eyes begin to read, it clears
    // out instead of becoming a shard-face or competing with the expression.
    // The silver skin fades on its OWN curve (see skinT): it survives well into
    // the body's arrival, so the visitor sees metal under matter.
    const characterReveal = this.activeState === "present" ? 1 : 1 - skinT;
    const fieldOpacity =
      (preWake ? spec.dustOpacity : spec.particleOpacity) * (1 - characterReveal);
    rt.opacityT = 1 - fieldOpacity;
    app.setParticlesVisible?.(characterReveal < 0.985);
    if (this.baseActualSize !== null) {
      rt.actualSize =
        this.baseActualSize *
        (preWake ? spec.dustScale : spec.particleScale) *
        this.densitySizeMul;
    }

    // Lifecycle composition: 0 = wide airy dust framing, 1 = present focus.
    // The camera must LAND before the eyes ignite. Easing it across the whole
    // wake meant Lenox was still growing while he booted — after a fullscreen
    // event the energy fell off a cliff and he arrived small and far away. It
    // now closes at the shell hold, on a tighter time constant, so the boot and
    // the first look happen at his final size.
    const compositionTarget =
      this.activeState === "present"
        ? 1
        : this.activeState === "awakening"
          ? smooth01(this.stateElapsed / Math.max(beats.shellHoldEnd, 0.01))
          : this.activeState === "armed"
            ? 0.12
            : 0;
    app.setLenoxComposition?.(
      compositionTarget,
      this.activeState === "awakening" ? 0.32 : 0.8,
    );

    // Expressive rig pose.
    const rigTarget =
      this.activeState === "present" ? 1 : this.activeState === "awakening" ? awakeningRig : 0;
    this.rigPresence += (rigTarget - this.rigPresence) * (1 - Math.exp(-dt / 0.35));

    const p = this.pose;
    const eyeOpen = this.activeState === "awakening" ? awakeEyeScale : this.blinkScale;

    // Gaze. There is no pupil left to move, so the look is carried by two
    // things at once: the head TURNS toward the cursor (`look`, applied by the
    // app around the sphere center — this is what actually reads), and the
    // signal set slides the last bit inside the display. Micro-saccades ride
    // on top so the eyes land NEAR the target and re-aim, instead of locking.
    const aimX = pointerNowX + this.saccadeX;
    const aimY = pointerNowY + this.saccadeY;
    let gazeVecX = Math.tanh(aimX * GAZE.gain * spec.gazeStrength * 0.9);
    let gazeVecY = Math.tanh(aimY * GAZE.gain * spec.gazeStrength * 0.9);

    // THINKING: eye contact breaks. The look drifts up and off to one side on
    // a slow wander — that act alone reads as an inner process, and the head
    // follows it, so Lenox visibly turns his attention inward.
    const thinkingEntry =
      this.emotion === "thinking"
        ? smooth01(this.emotionEntryT / 0.18)
        : 1;
    const away = clamp01(p.gazeAway) * thinkingEntry;
    if (away > 0.001) {
      this.wanderPhase += dt * 0.42;
      const thinkingSettle = smooth01((this.emotionEntryT - 0.18) / 0.72);
      const attentionWander = 1.2 - this.attention * 0.55;
      const wanderAmount =
        motionProfile.wander * attentionWander * (1 - thinkingSettle * 0.68);
      const wanderX = -0.5 + Math.sin(this.wanderPhase * 0.55) * 0.24 * wanderAmount;
      const wanderY =
        0.55 + Math.sin(this.wanderPhase * 0.37 + 1.3) * 0.14 * wanderAmount;
      gazeVecX += (wanderX - gazeVecX) * away;
      gazeVecY += (wanderY - gazeVecY) * away;
    }

    const gazeLen = Math.hypot(gazeVecX, gazeVecY);
    const norm = gazeLen > 1 ? 1 / gazeLen : 1;
    const eyeLookX = gazeVecX * norm * gazeOn;
    const eyeLookY = gazeVecY * norm * gazeOn;
    const gazeFx = eyeLookX * SIGNAL.gazeTravelX;
    const gazeFy = eyeLookY * SIGNAL.gazeTravelY;

    // Eyes acquire first; the existing head pivot follows through a filtered
    // copy. Thinking deliberately delays that follow so eye contact breaks
    // before the head settles into the internal focus.
    const thinkingHeadAcquire =
      this.emotion === "thinking"
        ? smooth01((this.emotionEntryT - 0.12) / 0.42)
        : 1;
    const headAttention = 0.45 + this.attention * 0.55;
    const headGoalX =
      eyeLookX * motionProfile.headFollow * headAttention * thinkingHeadAcquire;
    const headGoalY =
      eyeLookY * motionProfile.headFollow * headAttention * thinkingHeadAcquire;
    const headTau = 0.12 / Math.max(0.2, motionProfile.headLag * headAttention);
    const headK = 1 - Math.exp(-Math.max(dt, 0) / headTau);
    const previousHeadX = this.headLookX;
    const previousHeadY = this.headLookY;
    this.headLookX += (headGoalX - this.headLookX) * headK;
    this.headLookY += (headGoalY - this.headLookY) * headK;
    this.headTurnMotion =
      Math.hypot(this.headLookX - previousHeadX, this.headLookY - previousHeadY) /
      Math.max(dt, 1 / 120);
    const lookX = this.headLookX;
    const lookY = this.headLookY;

    // Face units: +x = screen RIGHT. Index 0 is the screen-LEFT eye, and
    // rotation is authored screen-CCW, so the app receives ready-to-use
    // face-local values (no sim mirroring leaks into the rig).
    const ticAmount = smooth01(this.ticT / 0.55) * (this.reducedMotion ? 0.3 : 1);
    const thinkingAsymmetry =
      this.emotion === "thinking"
        ? smooth01(this.emotionEntryT / 0.2) *
          (1 - smooth01((this.emotionEntryT - 0.28) / 0.5))
        : 0;
    const speechWake = this.speech.emphasis * clamp01(p.speak);
    const visualWakefulness = 1 + (this.attention - 0.5) * 0.035;
    const eyes = [];
    for (let i = 0; i < 2; i++) {
      const sideX = i === 0 ? -SIGNAL.eyeHalfSep : SIGNAL.eyeHalfSep;
      const arc = clamp01(i === 0 ? p.eyeArcL : p.eyeArcR);
      // An arc has no lid to close, so the blink only squashes capsules.
      const blink = 1 - (1 - eyeOpen) * (1 - arc);
      // A brief single-eye narrowing — transient, never a resting asymmetry.
      const tic = i === this.ticSide ? 1 - ticAmount * 0.14 : 1;
      const thought = i === 1 ? 1 - thinkingAsymmetry * 0.1 : 1;
      const sy =
        (i === 0 ? p.eyeSyL : p.eyeSyR) *
        blink *
        tic *
        thought *
        visualWakefulness *
        (1 + speechWake * 0.07);
      const sx = i === 0 ? p.eyeSxL : p.eyeSxR;

      eyes.push({
        x: sideX + gazeFx,
        y: SIGNAL.eyeY + gazeFy,
        rot: i === 0 ? p.eyeRotL : p.eyeRotR,
        rx: SIGNAL.eyeRx * sx,
        ry: SIGNAL.eyeRx * Math.max(sy, 0.04),
        arc,
      });
    }

    // Speech: the slot cross-fades in over the tone arc, and its opening comes
    // from the procedural envelope — irregular, with pauses.
    const speak = clamp01(p.speak);
    const startleActive = this.reaction?.name === "startle";
    const speechAmp = startleActive ? 1 : this.speech.amp;
    const slotOpen =
      SIGNAL.slotClosed + (SIGNAL.slotOpen - SIGNAL.slotClosed) * speechAmp;
    // The head answers a stressed syllable once — it does not nod along.
    const speechNod =
      this.speech.nodT >= 0 && this.speech.nodT < 0.24
        ? smooth01(this.speech.nodT / 0.08) *
          (1 - smooth01((this.speech.nodT - 0.08) / 0.16))
        : 0;
    const commitPulse =
      this.emotion === "acting" && this.emotionEntryT < 0.28
        ? smooth01(this.emotionEntryT / 0.09) *
          (1 - smooth01((this.emotionEntryT - 0.09) / 0.19))
        : 0;
    const nod = (speechNod * speak * 0.02 + commitPulse * 0.016) * motionScale;

    const breath =
      this.activeState === "present"
        ? Math.sin(this.breathePhase) * 0.5 + 0.5
        : 0;

    app.setLenoxRig?.({
      presence: this.rigPresence,
      /** Body envelope — the shell exists before the face does. */
      body: bodyT,
      accentColor: this.accent,
      time: this.clock,
      confirm: this.confirmT,
      /** Normalized look direction (-1…1), screen space. Drives the head turn. */
      look: { x: lookX, y: lookY },
      /** 0…1 breathing phase; the body swells, the face does not. */
      breath,
      dt: Math.max(dt, 0),
      head: {
        x: bobX + head.bounceX,
        y: bobY,
        tilt: p.tilt + head.tiltAdd,
        squash: head.squash,
        nod,
      },
      eyes,
      waves: clamp01(p.waves),
      mouth: {
        x: gazeFx * 0.4,
        y: SIGNAL.mouthY + gazeFy * 0.4,
        curve: p.mouthCurve,
        width: p.mouthWidth,
        speak,
        slotOpen,
        visible: p.mouthOn > 0.5,
        alpha: p.mouthAlpha,
      },
      checkScale: SIGNAL.checkScale,
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

    // Silver-material channel: same liquid metal across every lifecycle
    // state — dust, play mass and the present face are one material.
    rt.lenoxMetalness = spec.metalness;
    rt.lenoxRoughness = spec.roughness;
    rt.lenoxEnvIntensity = spec.envIntensity;
    rt.lenoxSilverGain = spec.silverGain;
    app.setLenoxLightRig?.({
      keyIntensity: spec.keyIntensity,
      hemiIntensity: spec.hemiIntensity,
      keyX: spec.keyX,
      keyY: spec.keyY,
      keyZ: spec.keyZ,
    });

    // Pointer authority through the birth. It is DAMPED, never cut: the visitor
    // must feel that the matter is still his while it collapses — that is the
    // one thing a pre-rendered film can never do — but he must not be able to
    // derail the choreography. Authority reaches zero at the shell lock.
    let pointerInfluence = cur.pointerInfluence;
    if (this.activeState === "awakening") {
      const t = this.stateElapsed;
      const handoverAuthority = 0.35;
      if (t < beats.implosionEnd) {
        pointerInfluence = THREE_LERP(
          LIFECYCLE.armed.pointerInfluence,
          handoverAuthority,
          smooth01(t / Math.max(beats.implosionEnd, 0.01)),
        );
      } else {
        pointerInfluence =
          handoverAuthority *
          (1 -
            smooth01(
              (t - beats.implosionEnd) /
                Math.max(beats.shellEnd - beats.implosionEnd, 0.01),
            ));
      }
    }
    app.setPointerInfluence(pointerInfluence);
    return this.activeState;
  }
}
