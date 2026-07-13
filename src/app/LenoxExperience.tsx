"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { FlowEngineBridge } from "../flow-engine/engineBridge";
import type {
  LenoxEmotion,
  LenoxProofState,
  LenoxReaction,
} from "../flow-engine/types";
import { useLocale } from "../i18n/useLocale";
import { FallbackEyes } from "./FallbackEyes";
import { CornerHud } from "./stage/CornerHud";
import { FirstContact } from "./stage/FirstContact";
import { stageReducer } from "./stage/stageState";
import { Workspace } from "./stage/Workspace";

/** The eight PRIME display states, in character-sheet order. */
const EMOTIONS: LenoxEmotion[] = [
  "neutral",
  "curious",
  "pleased",
  "concerned",
  "listening",
  "thinking",
  "speaking",
  "acting",
];
const REACTIONS: LenoxReaction[] = ["confirm", "laugh", "startle", "tired"];

const PRE_WAKE: LenoxProofState[] = [
  "dormant",
  "engaged",
  "armed",
  "idle",
  "attract",
];

const expressionButton = (active = false): React.CSSProperties => ({
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 999,
  border: active
    ? "1px solid rgba(103, 226, 242, 0.78)"
    : "1px solid rgba(143, 174, 182, 0.24)",
  background: active
    ? "rgba(18, 63, 72, 0.72)"
    : "rgba(4, 10, 13, 0.72)",
  color: active ? "#baf6ff" : "rgba(215, 231, 235, 0.72)",
  font: "10px ui-monospace, SFMono-Regular, Menlo, monospace",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
});


/**
 * The single main path (/):
 *   PARTICLE PLAY (free fluid, pointer interaction)
 *   → WAKE LENOX (drive-owned awakening)
 *   → present Lenox with gaze, emotions and reactions.
 * Ported from the former /lenox-proof harness; engine and drive untouched.
 */
export function LenoxExperience() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<FlowEngineBridge | null>(null);

  const [gpuPath, setGpuPath] = useState<"webgpu" | "fallback" | "probing">(
    "probing",
  );
  const [state, setState] = useState<LenoxProofState>("idle");
  const [emotion, setEmotion] = useState<LenoxEmotion>("neutral");

  /**
   * The expression console is a workbench, not part of the experience. It used
   * to sit under the finished page for every visitor — a row of debug buttons
   * captioned NEUTRAL / CURIOUS / STARTLE, which reads as "here are the tricks"
   * at exactly the moment he is supposed to simply be alive.
   *
   * Opt in with ?debug=expressions.
   */
  // Read once. The server has no query string and the console never renders
  // before READY, so there is nothing for hydration to disagree about.
  const [debug] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") ===
        "expressions",
  );

  // The experience lifecycle. One owner, one truth — the engine reports where it
  // is, the stage decides what that means. Everything past recognition is the
  // visitor's move, and the reducer is the only thing allowed to make it.
  const [stage, dispatch] = useReducer(stageReducer, "dormant");
  const { locale, setLocale, m } = useLocale();

  const applyLenoxState = useCallback((next: LenoxProofState) => {
    setState(next);
    dispatch({ type: "ENGINE", state: next });
  }, []);

  // WebGPU detection + engine boot.
  useEffect(() => {
    if (!navigator.gpu) {
      const t = window.setTimeout(() => setGpuPath("fallback"), 0);
      return () => window.clearTimeout(t);
    }
    const host = hostRef.current;
    if (!host) return;

    const bridge = new FlowEngineBridge(host, {
      lenoxMode: true,
      lenoxReducedMotion: window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches,
      onLenoxStateChange: applyLenoxState,
      onError: (error) => {
        console.error("[lenox] engine error", error);
      },
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
  }, [applyLenoxState]);

  // While he inspects his own work the cursor must not yank his eyes back.
  const gazeScripted = useRef(false);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    bridge.setPointer(event.clientX, event.clientY, false);
    if (gazeScripted.current) return;
    bridge.setLenoxGaze(
      event.clientX / window.innerWidth - 0.5,
      0.5 - event.clientY / window.innerHeight,
    );
  }, []);

  /**
   * Workbench probes — ?debug=expressions only. A visitor who happens to type R
   * must not be able to fly the camera; hidden keyboard tricks in a shipped
   * experience are a bug waiting for someone with a mechanical keyboard.
   *
   *   R — the operator move, driven by hand rather than by the build.
   *   E — what he reflects: the void studio vs. the legacy meadow HDRI.
   */
  useEffect(() => {
    if (!debug) return;

    let operator = false;
    let voidEnv = true;
    const timers: number[] = [];

    const onKey = (event: KeyboardEvent) => {
      const bridge = bridgeRef.current;
      if (!bridge) return;

      if (event.key === "r" || event.key === "R") {
        operator = !operator;
        bridge.setLenoxOperator(operator ? 1 : 0, 1.1);
        timers.forEach(window.clearTimeout);
        timers.length = 0;
        if (!operator) {
          gazeScripted.current = false;
          return;
        }
        gazeScripted.current = true;
        // Let the camera settle before he reacts — he inspects the finished
        // room, not the move.
        timers.push(
          window.setTimeout(() => bridge.setLenoxGaze(0.42, -0.05), 1500),
        );
        timers.push(
          window.setTimeout(() => {
            bridge.setLenoxGaze(0, 0);
            gazeScripted.current = false;
          }, 2600),
        );
      }

      if (event.key === "e" || event.key === "E") {
        voidEnv = !voidEnv;
        bridge.setLenoxEnvironment(voidEnv);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      timers.forEach(window.clearTimeout);
    };
  }, [debug]);

  const wake = useCallback(() => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    bridge.setLenoxState("waking");
    applyLenoxState("waking");
  }, [applyLenoxState]);

  const onSpoken = useCallback(() => dispatch({ type: "SPOKEN" }), []);
  const onBuilt = useCallback(() => dispatch({ type: "BUILT" }), []);

  /**
   * Build hooks. None of these own a clock — the timeline calls them at its own
   * labels, which is the whole point: he steps aside, looks at the space, and the
   * page appears in it as ONE gesture. A setTimeout here would be a second clock
   * drifting against the first.
   */
  const onOperator = useCallback((target: number) => {
    bridgeRef.current?.setLenoxOperator(target, 1.1);
  }, []);

  const onGaze = useCallback((x: number, y: number) => {
    // Held: while the timeline is looking through his eyes, the cursor must not
    // yank them back. Releasing at (0,0) hands him back to the visitor.
    gazeScripted.current = !(x === 0 && y === 0);
    bridgeRef.current?.setLenoxGaze(x, y);
  }, []);

  // Pushed to the engine, and mirrored for the debug console — a workbench that
  // shows a stale state is worse than no workbench. Safe to setState here now
  // that emotions are driven from callbacks rather than an effect body.
  const onEmotion = useCallback((next: LenoxEmotion) => {
    bridgeRef.current?.setLenoxEmotion(next);
    setEmotion(next);
  }, []);

  /**
   * He stays. Changing region is not a new intro — he glances at the part of the
   * page you just asked for, and comes back to you. No re-wake, ever.
   *
   * The return timer is single: click three regions quickly and the old timers
   * would fire mid-glance, snapping him back to neutral while he is still
   * looking at the second one.
   */
  const glanceBack = useRef<number | null>(null);
  const onRegionChange = useCallback(() => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    if (glanceBack.current !== null) window.clearTimeout(glanceBack.current);

    gazeScripted.current = true;
    onEmotion("curious");
    bridge.setLenoxGaze(0.38, -0.02);

    glanceBack.current = window.setTimeout(() => {
      bridge.setLenoxGaze(0, 0);
      onEmotion("neutral");
      gazeScripted.current = false;
      glanceBack.current = null;
    }, 900);
  }, [onEmotion]);

  useEffect(
    () => () => {
      if (glanceBack.current !== null) window.clearTimeout(glanceBack.current);
    },
    [],
  );

  // He is silent when he is silent. `speaking` starts when the sentence does —
  // FirstContact owns that beat, so it says when.
  const onSpeechStart = useCallback(
    () => onEmotion("speaking"),
    [onEmotion],
  );

  const preWake = PRE_WAKE.includes(state);
  const built = stage === "building" || stage === "ready";

  return (
    <div
      className="lenox-stage"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        touchAction: "none",
      }}
      onPointerMove={onPointerMove}
      // Leaving the window releases his eyes — unless the timeline is currently
      // using them. A cursor exiting mid-build must not cancel the glance at the
      // page he is making.
      onPointerLeave={() => {
        if (gazeScripted.current) return;
        bridgeRef.current?.setLenoxGaze(0, 0);
      }}
    >
      {gpuPath === "fallback" ? (
        <FallbackEyes state={state} />
      ) : (
        <div
          ref={hostRef}
          style={{ position: "absolute", inset: 0, zIndex: 1 }}
        />
      )}

      <CornerHud
        stage={stage}
        gpu={gpuPath}
        locale={locale}
        setLocale={setLocale}
        m={m}
      />


      {/* WAKE LENOX — the only pre-wake control.
          Without WebGPU there is no bridge, so waking cannot happen: the button
          stays disabled and the corner readout says so (statusFor → unavailable).
          It used to sit there enabled, calling a wake() that returned on a null
          bridge — a live primary button that did nothing. A dead control that
          looks alive is worse than an honest disabled one. */}
      {preWake ? (
        <div className="lenox-wake-control">
          <button
            type="button"
            className="lenox-wake-btn"
            onClick={wake}
            disabled={gpuPath !== "webgpu"}
          >
            WAKE LENOX
          </button>
        </div>
      ) : null}

      {/* He has found you. The line grows out of him, he says one sentence, and
          then he builds — no question in between. */}
      {stage === "recognition" ? (
        <FirstContact
          text={m.greeting}
          onSpeechStart={onSpeechStart}
          onSpoken={onSpoken}
        />
      ) : null}

      {/* Mounted for BUILDING and never unmounted. What he built has to still be
          standing afterwards, or the build was a cutscene. */}
      {built ? (
        <Workspace
          m={m}
          building={stage === "building"}
          onOperator={onOperator}
          onGaze={onGaze}
          onEmotion={onEmotion}
          onBuilt={onBuilt}
          onRegionChange={onRegionChange}
        />
      ) : null}

      {/* Dev console — ?debug=expressions only. Not part of the experience. */}
      {debug && stage === "ready" ? (
        <div
          aria-label="Lenox expression controls"
          style={{
            position: "fixed",
            left: "50%",
            bottom: "max(18px, env(safe-area-inset-bottom))",
            zIndex: 60,
            transform: "translateX(-50%)",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 8,
            width: "min(1040px, calc(100vw - 32px))",
            padding: 8,
            border: "1px solid rgba(143, 174, 182, 0.14)",
            borderRadius: 24,
            background: "rgba(2, 7, 9, 0.58)",
            backdropFilter: "blur(14px)",
          }}
        >
          {EMOTIONS.map((nextEmotion) => (
            <button
              key={nextEmotion}
              type="button"
              aria-pressed={emotion === nextEmotion}
              style={expressionButton(emotion === nextEmotion)}
              onClick={() => {
                bridgeRef.current?.setLenoxEmotion(nextEmotion);
                setEmotion(nextEmotion);
              }}
            >
              {nextEmotion}
            </button>
          ))}
          {REACTIONS.map((reaction) => (
            <button
              key={reaction}
              type="button"
              style={{
                ...expressionButton(),
                borderColor: "rgba(224, 170, 90, 0.38)",
                color: "rgba(242, 203, 146, 0.82)",
              }}
              onClick={() => bridgeRef.current?.setLenoxReaction(reaction)}
            >
              {reaction}
            </button>
          ))}
        </div>
      ) : null}

    </div>
  );
}
