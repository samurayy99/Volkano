"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlowEngineBridge } from "../../../flow-engine/engineBridge";
import {
  ALERTNESS_DECAY,
  ALERTNESS_RISE,
  approach,
  initialParams,
  stepToward,
  type PhaseName,
  type PhaseParams,
} from "./phases";
import {
  DEFAULT_FOCUS,
  ambientAnchors,
  blendedTargets,
  clampToBounds,
  type Bounds,
  type FocusParams,
} from "./targets";
import type { EnvironmentCost } from "../../../flow-engine/types";
import styles from "./PhaseFieldProto.module.css";

/**
 * PROOF A — PHASE FIELD MATERIAL STATES
 *
 * Proves three things and refuses to claim a fourth:
 *   1. one particle population reads as three behaviours
 *   2. it reads as matter rather than dust
 *   3. which environment map makes that difference
 *
 * NOT proven here: optical connection, condensate material, refraction. Those
 * need render passes this proof deliberately does not add — they are Proof B.
 * LENOX here is directed COHERENCE, still visibly particulate.
 *
 * Direction: docs/product/design-01-living-surface.md
 * Task:      docs/agent-system/TASK.md
 */

type EnvSource = "procedural" | "studio" | "meadow";
type Tier = "low" | "medium" | "high";

const SUBSTANCES = [
  { id: "pearl", label: "PEARL", hex: 0xdfe9e4, strength: 0.0 },
  { id: "ultramarine", label: "ULTRA", hex: 0x1f3fa8, strength: 0.62 },
  { id: "mineral", label: "MINERAL", hex: 0x1a1f24, strength: 0.7 },
  { id: "oxide", label: "OXIDE", hex: 0x8a3a12, strength: 0.55 },
] as const;

const TIERS: Record<Tier, number> = { low: 4096, medium: 16384, high: 32768 };

/**
 * Measured, not assumed: a full-viewport field is FILL-RATE bound, not solver
 * bound. At 2880×1612 (DPR 2) the engine submits in ~1.4 ms while the frame
 * takes ~25 ms — 4096 particles gave 51 fps, 32768 gave 22, with engine time
 * flat throughout. P1 hit 120 fps with the same count because its matter was a
 * compact ball covering a fraction of the screen.
 *
 * So the levers that matter here are particle SIZE and DPR, not particle count
 * alone. Both are exposed rather than guessed — this is exactly the "adaptive
 * tiers determined by visual testing" the task asks for.
 */
const MATERIAL_DEFAULTS = { size: 0.68, roughness: 0.3, metalness: 0.85 };

/**
 * Fallback only. The real box comes from `getSimBounds()` — the engine's own
 * projection-safe region. Guessing it put the camera inside the medium, where
 * the LENOX concentration was present but impossible to read.
 */
const FALLBACK_BOUNDS: Bounds = { min: [14, 14, 28], max: [50, 50, 32] };

export function PhaseFieldProto() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<FlowEngineBridge | null>(null);
  const paramsRef = useRef<PhaseParams>(initialParams());
  const phaseRef = useRef<PhaseName>("ambient");
  const alertnessRef = useRef(0);
  const focusRef = useRef<FocusParams>({ ...DEFAULT_FOCUS });
  const lastTouchRef = useRef(0);
  const inTransitionRef = useRef(false);
  const anchorClockRef = useRef(0);
  const lastAnchorUploadRef = useRef(0);
  const lastWasFocusRef = useRef(false);
  const focusDirtyRef = useRef(true);
  const boundsRef = useRef<Bounds>(FALLBACK_BOUNDS);
  const coherenceRef = useRef(0.34);

  const [ready, setReady] = useState<"probing" | "webgpu" | "fallback">("probing");
  const [phase, setPhase] = useState<PhaseName>("ambient");
  const [substance, setSubstance] = useState<string>("pearl");
  const [env, setEnv] = useState<EnvSource>("procedural");
  const [envCost, setEnvCost] = useState<EnvironmentCost | null>(null);
  const [envRotation, setEnvRotation] = useState(0);
  const [envIntensity, setEnvIntensity] = useState(1);
  const [tier, setTier] = useState<Tier>("medium");
  const [material, setMaterial] = useState({ ...MATERIAL_DEFAULTS });
  const [focus, setFocus] = useState<FocusParams>({ ...DEFAULT_FOCUS });
  /** Fraction of the population that joins the concentration. */
  const [coherence, setCoherence] = useState(0.34);
  const [probe, setProbe] = useState({
    fps: 0,
    worst: 0,
    engineMs: 0,
    particles: 0,
    speed: 0,
  });

  useEffect(() => {
    focusRef.current = focus;
    focusDirtyRef.current = true;
  }, [focus]);

  useEffect(() => {
    coherenceRef.current = coherence;
    focusDirtyRef.current = true;
  }, [coherence]);

  useEffect(() => {
    focusDirtyRef.current = true;
  }, [tier]);

  /* ── engine ────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !navigator.gpu) {
      const t = window.setTimeout(() => setReady("fallback"), 0);
      return () => window.clearTimeout(t);
    }
    const bridge = new FlowEngineBridge(host, {
      // No LenoxEyesDrive: the retired wake sequence must not run here.
      phaseField: true,
      lenoxBackdrop: false,
      onError: (e) => console.error("[phase-field] engine error", e),
      onDeviceLost: () => setReady("fallback"),
    });
    bridgeRef.current = bridge;
    let cancelled = false;
    bridge
      .init()
      .then(() => {
        if (cancelled) return;
        setReady("webgpu");
        // Without LenoxEyesDrive nothing switches the material to the silver
        // law, so the chamber's hot-basalt path renders and everything comes
        // out lava red. This is the PEARL baseline the substances vary from.
        bridge.applyEngineRuntime({
          lenoxTintT: 1,
          lenoxMetalness: 0.85,
          lenoxRoughness: 0.3,
          lenoxSilverGain: 1,
        });
        const b = bridge.getSimBounds();
        if (b) boundsRef.current = b;
        bridge
          .setEnvironment("procedural")
          .then((c) => c.applied && setEnvCost(c));
      })
      .catch((e) => {
        console.warn("[phase-field] WebGPU unavailable", e);
        if (!cancelled) setReady("fallback");
      });
    return () => {
      cancelled = true;
      bridge.dispose();
      if (bridgeRef.current === bridge) bridgeRef.current = null;
    };
  }, []);

  /* ── the loop: phase params, targets, probe ───────────────────────────── */
  useEffect(() => {
    if (ready !== "webgpu") return;
    let raf = 0;
    let stopped = false;
    let last = 0;
    let acc = 0;
    let frames = 0;
    let worst = 0;

    const tick = (now: number) => {
      if (stopped) return;
      if (last === 0) {
        last = now;
        raf = window.requestAnimationFrame(tick);
        return;
      }
      const dtMs = now - last;
      last = now;
      const dt = Math.min(dtMs / 1000, 1 / 20);
      const bridge = bridgeRef.current;
      if (!bridge) {
        raf = window.requestAnimationFrame(tick);
        return;
      }

      // Alertness rises on contact and decays on its own, slower clock.
      const touchedRecently = now - lastTouchRef.current < 140;
      alertnessRef.current = approach(
        alertnessRef.current,
        touchedRecently ? 1 : 0,
        touchedRecently ? ALERTNESS_RISE : ALERTNESS_DECAY,
        dt,
      );

      // Ambient becomes attentive by itself; LENOX is only ever explicit.
      const effective: PhaseName =
        phaseRef.current === "lenox"
          ? "lenox"
          : alertnessRef.current > 0.25
            ? "attention"
            : "ambient";

      const before = paramsRef.current;
      const p = stepToward(before, effective, dt);
      paramsRef.current = p;
      inTransitionRef.current =
        Math.abs(p.targetInfluence - before.targetInfluence) > 0.0004;

      bridge.setTargetInfluence(p.targetInfluence);
      bridge.applyEngineRuntime({
        noise: p.noise,
        speed: p.speed,
        gravity: p.gravity,
        dynamicViscosity: p.dynamicViscosity,
      });

      // Targets are NOT rebuilt every frame. Uploading 16k triples at 60 Hz
      // cost 55 fps for drift nobody can perceive above ~12 Hz, and the focus
      // field does not move at all while its parameters are held.
      anchorClockRef.current += dt;
      const count = TIERS[tier];
      const wantFocus = phaseRef.current === "lenox";
      const focusDirty = focusDirtyRef.current || wantFocus !== lastWasFocusRef.current;

      // One bank always, blended. In LENOX a coherent fraction takes focus
      // targets while the rest stays in the ambient field — the whole point is
      // that both exist at the same time.
      if (wantFocus) {
        if (focusDirty) {
          bridge.setParticleTargets(
            clampToBounds(
              blendedTargets(
                count,
                boundsRef.current,
                anchorClockRef.current,
                p.anchorDrift,
                focusRef.current,
                coherenceRef.current,
              ),
              boundsRef.current,
            ),
            count,
          );
          focusDirtyRef.current = false;
        }
      } else if (focusDirty || now - lastAnchorUploadRef.current > 80) {
        lastAnchorUploadRef.current = now;
        bridge.setParticleTargets(
          ambientAnchors(
            count,
            boundsRef.current,
            anchorClockRef.current,
            p.anchorDrift,
          ),
          count,
        );
        // Must be cleared here too, or the flag stays set and the throttle
        // never engages — 16k structured writes per frame instead of per 80 ms.
        focusDirtyRef.current = false;
      }
      lastWasFocusRef.current = wantFocus;

      acc += dtMs;
      frames += 1;
      if (inTransitionRef.current && dtMs > worst) worst = dtMs;
      if (acc >= 500 && frames > 0) {
        const perf = (window as unknown as {
          __LENOX_PERF__?: { avgMs: number; particles: number };
        }).__LENOX_PERF__;
        setProbe({
          fps: Math.round((frames * 1000) / acc),
          worst: Math.round(worst * 10) / 10,
          engineMs: perf?.avgMs ?? 0,
          particles: perf?.particles ?? 0,
          speed: Math.round(bridge.getPointerSpeed()),
        });
        acc = 0;
        frames = 0;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
    };
  }, [ready, tier]);

  /* ── controls ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const s = SUBSTANCES.find((x) => x.id === substance);
    if (s) bridgeRef.current?.setSubstance(s.hex, s.strength);
  }, [substance, ready]);

  useEffect(() => {
    bridgeRef.current?.applyEngineRuntime({ particles: TIERS[tier] });
  }, [tier, ready]);

  useEffect(() => {
    bridgeRef.current?.applyEngineRuntime({
      size: material.size,
      lenoxRoughness: material.roughness,
      lenoxMetalness: material.metalness,
    });
  }, [material, ready]);

  const chooseEnv = useCallback(
    (next: EnvSource, rot = envRotation, intensity = envIntensity) => {
      setEnv(next);
      bridgeRef.current
        ?.setEnvironment(next, rot, intensity)
        // A superseded switch reports applied: false and is ignored, so a slow
        // HDRI cannot overwrite a newer choice or its cost readout.
        .then((c) => c.applied && setEnvCost(c));
    },
    [envRotation, envIntensity],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    lastTouchRef.current = performance.now();
    const bridge = bridgeRef.current;
    if (!bridge) return;
    bridge.setPointerSample(e.clientX, e.clientY);
    bridge.setPointer(e.clientX, e.clientY, false);
  }, []);

  const onPointerLeave = useCallback(() => {
    bridgeRef.current?.clearPointer();
  }, []);

  const slider = (
    key: keyof FocusParams,
    label: string,
    min: number,
    max: number,
    step: number,
  ) => (
    <label className={styles.slider} key={key}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={focus[key] as number}
        onChange={(e) =>
          setFocus((f) => ({ ...f, [key]: Number(e.target.value) }))
        }
      />
      <span>{(focus[key] as number).toFixed(2)}</span>
    </label>
  );

  return (
    <div
      className={styles.root}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div ref={hostRef} className={styles.host} />

      {ready === "fallback" ? (
        <div className={styles.fallback}>
          WebGPU unavailable — this lab measures the live solver and has no
          meaningful static form.
        </div>
      ) : null}

      <div className={styles.panel}>
        <div className={styles.group}>
          <b>PHASE</b>
          <div className={styles.row}>
            {(["ambient", "attention", "lenox"] as PhaseName[]).map((p) => (
              <button
                key={p}
                type="button"
                data-on={phase === p}
                onClick={() => setPhase(p)}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.group}>
          <b>SUBSTANCE — PEARL IS THE BASELINE</b>
          <div className={styles.row}>
            {SUBSTANCES.map((s) => (
              <button
                key={s.id}
                type="button"
                data-on={substance === s.id}
                onClick={() => setSubstance(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.group}>
          <b>ENVIRONMENT — MEADOW IS THE NEGATIVE CONTROL</b>
          <div className={styles.row}>
            {(["procedural", "studio", "meadow"] as EnvSource[]).map((e) => (
              <button
                key={e}
                type="button"
                data-on={env === e}
                onClick={() => chooseEnv(e)}
              >
                {e === "procedural" ? "PROC" : e === "studio" ? "STUDIO" : "MEADOW"}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.group}>
          <b>ENV ORIENTATION — ONE FIXED ANGLE IS NOT A COMPARISON</b>
          <label className={styles.slider}>
            <span>rotation</span>
            <input
              type="range"
              min={0}
              max={6.28}
              step={0.01}
              value={envRotation}
              onChange={(e) => {
                const v = Number(e.target.value);
                setEnvRotation(v);
                chooseEnv(env, v, envIntensity);
              }}
            />
            <span>{envRotation.toFixed(2)}</span>
          </label>
          <label className={styles.slider}>
            <span>intensity</span>
            <input
              type="range"
              min={0.1}
              max={3}
              step={0.05}
              value={envIntensity}
              onChange={(e) => {
                const v = Number(e.target.value);
                setEnvIntensity(v);
                chooseEnv(env, envRotation, v);
              }}
            />
            <span>{envIntensity.toFixed(2)}</span>
          </label>
        </div>

        <div className={styles.group}>
          <b>PARTICLE TIER</b>
          <div className={styles.row}>
            {(["low", "medium", "high"] as Tier[]).map((t) => (
              <button
                key={t}
                type="button"
                data-on={tier === t}
                onClick={() => setTier(t)}
              >
                {TIERS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.group}>
          <b>MATERIAL — SIZE IS ALSO THE FILL-RATE LEVER</b>
          {(
            [
              ["size", "size", 0.2, 1.4, 0.01],
              ["roughness", "roughness", 0.05, 0.92, 0.01],
              ["metalness", "metalness", 0, 1, 0.01],
            ] as const
          ).map(([key, label, min, max, step]) => (
            <label className={styles.slider} key={key}>
              <span>{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={material[key]}
                onChange={(e) =>
                  setMaterial((m) => ({ ...m, [key]: Number(e.target.value) }))
                }
              />
              <span>{material[key].toFixed(2)}</span>
            </label>
          ))}
        </div>

        <div className={styles.group}>
          <b>FOCUS FORM — HYPOTHESIS, NOT A DECISION</b>
          <label className={styles.slider}>
            <span>coherence</span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.01}
              value={coherence}
              onChange={(e) => setCoherence(Number(e.target.value))}
            />
            <span>{coherence.toFixed(2)}</span>
          </label>
          {slider("anisotropy", "anisotropy", 1, 5, 0.05)}
          {slider("arcCompleteness", "arc", 0.08, 1, 0.01)}
          {slider("asymmetry", "asymmetry", 0, 1, 0.01)}
          {slider("densityFalloff", "falloff", 0.4, 4, 0.05)}
          {slider("direction", "direction", -3.14, 3.14, 0.01)}
          {slider("phaseLag", "phase lag", 0, 1, 0.01)}
        </div>
      </div>

      <div className={styles.hud} data-warn={probe.worst > 34}>
        <span>PROOF A · PHASE FIELD</span>
        <span>
          {phase.toUpperCase()} · {substance.toUpperCase()} · {env.toUpperCase()}
        </span>
        <span>
          SOURCE FILE <b>{(envCost?.sourceFileBytes ?? 0).toLocaleString()}</b> B
        </span>
        <span>
          DECODED <b>{Math.round((envCost?.decodedBytes ?? 0) / 1024)}</b> KB · GPU
          EST <b>{Math.round((envCost?.gpuEstimateBytes ?? 0) / 1024)}</b> KB
        </span>
        <span>
          FPS <b>{probe.fps}</b> · WORST IN TRANSITION{" "}
          <b className={styles.frame}>{probe.worst} ms</b>
        </span>
        <span>
          ENGINE <b>{probe.engineMs} ms</b> · <b>{probe.particles}</b> PARTICLES
        </span>
        <span>
          POINTER <b>{probe.speed} px/s</b>
        </span>
      </div>
    </div>
  );
}
