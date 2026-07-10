"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlowEngineBridge } from "../../flow-engine/engineBridge";
import type {
  LenoxEmotion,
  LenoxProofState,
  LenoxReaction,
} from "../../flow-engine/types";
import { FallbackEyes } from "./FallbackEyes";

const STATES: LenoxProofState[] = ["idle", "attract", "waking", "alive"];
const EMOTIONS: LenoxEmotion[] = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "surprised",
  "suspicious",
  "thinking",
  "listening",
];
const REACTIONS: LenoxReaction[] = ["laugh", "startle", "tired"];

const chipStyle = (active: boolean): React.CSSProperties => ({
  appearance: "none",
  cursor: "pointer",
  font: "10px ui-monospace, monospace",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  padding: "6px 12px",
  borderRadius: 999,
  border: active
    ? "1px solid rgba(77, 240, 255, 0.7)"
    : "1px solid rgba(180, 200, 210, 0.2)",
  background: "rgba(0,0,0,0.45)",
  color: active ? "#9feaf7" : "rgba(200, 214, 220, 0.6)",
});

/**
 * Lenox Eyes Proof — dev harness for the WebGPU fluid engine in void mode.
 * Buttons drive the LenoxEyesDrive states; pointer feeds both the fluid
 * interaction ray and the gaze target. HUD shows FPS / particles / path.
 */
export function LenoxProof() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<FlowEngineBridge | null>(null);
  const frameCountRef = useRef(0);

  const [gpuPath, setGpuPath] = useState<"webgpu" | "fallback" | "probing">(
    "probing",
  );
  const [state, setState] = useState<LenoxProofState>("idle");
  const [fps, setFps] = useState(0);
  const [particles, setParticles] = useState(0);
  const [particlesOn, setParticlesOn] = useState(true);
  const [emotion, setEmotion] = useState<LenoxEmotion>("neutral");

  // WebGPU detection + engine boot.
  useEffect(() => {
    if (!navigator.gpu) {
      setGpuPath("fallback");
      return;
    }
    const host = hostRef.current;
    if (!host) return;

    const bridge = new FlowEngineBridge(host, {
      lenoxMode: true,
      onLenoxStateChange: setState,
      onError: (error) => {
        console.error("[lenox-proof] engine error", error);
      },
    });
    bridgeRef.current = bridge;

    let cancelled = false;
    bridge
      .init()
      .then(() => {
        if (cancelled) return;
        setGpuPath("webgpu");
        // Lenox mode caps simulated count for the packed-volume regime.
        setParticles(Math.min(window.innerWidth < 768 ? 4096 : 8192 * 4, 8192));
      })
      .catch((error) => {
        console.warn("[lenox-proof] WebGPU init failed → fallback", error);
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
  }, []);

  // FPS meter (independent of the engine loop).
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      frameCountRef.current += 1;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / (now - last)));
        frameCountRef.current = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    // Fluid interaction ray (existing path)…
    bridge.setPointer(event.clientX, event.clientY, false);
    // …plus gaze target in centered NDC (+y up).
    bridge.setLenoxGaze(
      event.clientX / window.innerWidth - 0.5,
      0.5 - event.clientY / window.innerHeight,
    );
  }, []);

  const setLenoxState = useCallback((next: LenoxProofState) => {
    bridgeRef.current?.setLenoxState(next);
    setState(next);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#050607",
        overflow: "hidden",
        touchAction: "none",
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => bridgeRef.current?.setLenoxGaze(0, 0)}
    >
      {gpuPath === "fallback" ? (
        <FallbackEyes state={state} />
      ) : (
        <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
      )}

      {/* HUD */}
      <div
        style={{
          position: "fixed",
          left: 14,
          top: 14,
          zIndex: 50,
          font: "11px/1.7 ui-monospace, monospace",
          letterSpacing: "0.08em",
          color: "rgba(180, 225, 235, 0.85)",
          background: "rgba(3, 6, 8, 0.72)",
          border: "1px solid rgba(77, 240, 255, 0.18)",
          borderRadius: 6,
          padding: "8px 12px",
          pointerEvents: "none",
        }}
      >
        LENOX EYES PROOF
        <br />
        FPS {fps} · STATE {state.toUpperCase()}
        <br />
        GPU {gpuPath === "webgpu" ? "WebGPU (MLS-MPM)" : gpuPath}
        <br />
        PARTICLES {gpuPath === "webgpu" ? particles.toLocaleString() : "2D"}
        <br />
        FALLBACK {gpuPath === "fallback" ? "ACTIVE" : "no"}
      </div>

      {/* Emotion + reaction controls */}
      <div
        style={{
          position: "fixed",
          bottom: 110,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 50,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: "90vw",
        }}
      >
        {EMOTIONS.map((e) => (
          <button
            key={e}
            type="button"
            style={chipStyle(e === emotion)}
            onClick={() => {
              bridgeRef.current?.setLenoxEmotion(e);
              setEmotion(e);
            }}
          >
            {e}
          </button>
        ))}
        {REACTIONS.map((r) => (
          <button
            key={r}
            type="button"
            style={{ ...chipStyle(false), color: "rgba(232, 200, 140, 0.8)", border: "1px solid rgba(224, 170, 90, 0.35)" }}
            onClick={() => bridgeRef.current?.setLenoxReaction(r)}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Preset controls */}
      <div
        style={{
          position: "fixed",
          bottom: 64,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 50,
          display: "flex",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={() => {
            setParticlesOn((v) => {
              bridgeRef.current?.setLenoxParticlesVisible(!v);
              return !v;
            });
          }}
          style={{
            appearance: "none",
            cursor: "pointer",
            font: "10px ui-monospace, monospace",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            padding: "6px 12px",
            borderRadius: 999,
            border: particlesOn
              ? "1px solid rgba(180, 200, 210, 0.2)"
              : "1px solid rgba(224, 139, 60, 0.6)",
            background: "rgba(0,0,0,0.45)",
            color: particlesOn
              ? "rgba(200, 214, 220, 0.6)"
              : "rgba(232, 180, 120, 0.9)",
          }}
        >
          particles {particlesOn ? "on" : "off"}
        </button>
      </div>

      {/* State controls */}
      <div
        style={{
          position: "fixed",
          bottom: 18,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 50,
          display: "flex",
          gap: 8,
        }}
      >
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setLenoxState(s)}
            style={{
              appearance: "none",
              cursor: "pointer",
              font: "11px ui-monospace, monospace",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "9px 16px",
              borderRadius: 999,
              border:
                s === state
                  ? "1px solid rgba(77, 240, 255, 0.8)"
                  : "1px solid rgba(180, 200, 210, 0.25)",
              background:
                s === state ? "rgba(77, 240, 255, 0.12)" : "rgba(0,0,0,0.5)",
              color: s === state ? "#9feaf7" : "rgba(200, 214, 220, 0.7)",
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
