"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlowEngineBridge } from "../../flow-engine/engineBridge";
import type { LenoxProofState } from "../../flow-engine/types";
import { FallbackEyes } from "../lenox-proof/FallbackEyes";
import styles from "./LenoxJourney.module.css";

/** Pointer travel (px) that arms the wake affordance. */
const ARM_TRAVEL_PX = 900;
/** Fallback: arm after this long in engaged even without much travel. */
const ARM_FALLBACK_SEC = 7;

type JourneyPhase = "void" | "play" | "armed" | "awakening" | "present";

const STATUS_TEXT: Record<JourneyPhase, string> = {
  void: "A dark, quiet particle field.",
  play: "The field notices you and follows your pointer.",
  armed: "Lenox can be woken now.",
  awakening: "The field is gathering into a living entity.",
  present: "Lenox is awake and looking at you.",
};

/**
 * Canonical Lenox journey: dormant → engaged (PLAY WITH ME) → armed
 * (WAKE LENOX) → awakening (authored ~3s) → present. Same runtime as the
 * proof harness — no second character engine.
 */
export function LenoxJourney() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<FlowEngineBridge | null>(null);
  const travelRef = useRef(0);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const phaseRef = useRef<JourneyPhase>("void");
  const armTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<JourneyPhase>("void");
  const [gpuPath, setGpuPath] = useState<"webgpu" | "fallback" | "probing">("probing");
  const [reducedMotion, setReducedMotion] = useState(false);

  const goPhase = useCallback((next: JourneyPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // Reduced-motion preference.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Engine boot (waits for the reduced-motion read on first paint).
  useEffect(() => {
    if (!navigator.gpu) {
      // Async so the fallback switch is not a render-blocking effect write.
      const t = window.setTimeout(() => setGpuPath("fallback"), 0);
      return () => window.clearTimeout(t);
    }
    const host = hostRef.current;
    if (!host) return;

    const bridge = new FlowEngineBridge(host, {
      lenoxMode: true,
      lenoxReducedMotion: reducedMotion,
      onLenoxStateChange: (state: LenoxProofState) => {
        if (state === "present" && phaseRef.current === "awakening") {
          goPhase("present");
        }
      },
      onError: (error) => console.error("[lenox] engine error", error),
    });
    bridgeRef.current = bridge;

    let cancelled = false;
    bridge
      .init()
      .then(() => {
        if (!cancelled) setGpuPath("webgpu");
      })
      .catch((error) => {
        console.warn("[lenox] WebGPU init failed → fallback", error);
        if (!cancelled) {
          bridge.dispose();
          bridgeRef.current = null;
          setGpuPath("fallback");
        }
      });

    return () => {
      cancelled = true;
      bridge.dispose();
      if (bridgeRef.current === bridge) bridgeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
    },
    [],
  );

  const arm = useCallback(() => {
    if (phaseRef.current !== "play") return;
    bridgeRef.current?.setLenoxState("armed");
    goPhase("armed");
  }, [goPhase]);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const bridge = bridgeRef.current;
      bridge?.setPointer(event.clientX, event.clientY, false);
      bridge?.setLenoxGaze(
        event.clientX / window.innerWidth - 0.5,
        0.5 - event.clientY / window.innerHeight,
      );

      const phaseNow = phaseRef.current;
      if (phaseNow === "void") {
        bridge?.setLenoxState("engaged");
        goPhase("play");
        armTimerRef.current = window.setTimeout(arm, ARM_FALLBACK_SEC * 1000);
        lastPointRef.current = { x: event.clientX, y: event.clientY };
        return;
      }
      if (phaseNow === "play") {
        const last = lastPointRef.current;
        if (last) {
          travelRef.current += Math.hypot(
            event.clientX - last.x,
            event.clientY - last.y,
          );
          if (travelRef.current >= ARM_TRAVEL_PX) arm();
        }
        lastPointRef.current = { x: event.clientX, y: event.clientY };
      }
    },
    [arm, goPhase],
  );

  const onWake = useCallback(() => {
    if (phaseRef.current !== "armed") return;
    bridgeRef.current?.setLenoxState("awakening");
    goPhase("awakening");
  }, [goPhase]);

  return (
    <div
      className={styles.stage}
      onPointerMove={onPointerMove}
      onPointerLeave={() => bridgeRef.current?.setLenoxGaze(0, 0)}
    >
      {gpuPath === "fallback" ? (
        <>
          <FallbackEyes state={phase === "present" ? "present" : "awakening"} />
          <p className={styles.fallbackNote}>
            LENOX RUNS BEST WITH WEBGPU — SHOWING A SIMPLE PREVIEW
          </p>
        </>
      ) : (
        <div
          ref={hostRef}
          className={styles.canvasHost}
          role="img"
          aria-label={STATUS_TEXT[phase]}
        />
      )}

      <span
        className={`${styles.brand} ${phase === "present" ? styles.brandVisible : ""}`}
      >
        VOLKAN AI STUDIO
      </span>

      {phase === "play" ? (
        <p className={styles.prompt} aria-hidden="true">
          PLAY WITH ME
        </p>
      ) : null}

      {phase === "armed" ? (
        <button type="button" className={styles.wake} onClick={onWake}>
          Wake Lenox
        </button>
      ) : null}

      <p className={styles.srOnly} role="status" aria-live="polite">
        {STATUS_TEXT[phase]}
      </p>
    </div>
  );
}
