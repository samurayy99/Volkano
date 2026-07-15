"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { FlowEngineBridge } from "../flow-engine/engineBridge";
import type {
  LenoxEmotion,
  LenoxProofState,
  LenoxReaction,
  LenoxSignatureId,
} from "../flow-engine/types";
import { useLocale } from "../i18n/useLocale";
import { FallbackEyes } from "./FallbackEyes";
import { createPlayMeter, decideSignature } from "./stage/calibration";
import { useCompositionMode } from "./stage/compositionMode";
import { CornerHud } from "./stage/CornerHud";
import { FirstContact } from "./stage/FirstContact";
import { Journey } from "./stage/Journey";
import { stageReducer } from "./stage/stageState";
import type { StationPose } from "./stage/stations";
import { transformTimeline } from "./stage/transformTimeline";

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

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  /**
   * How he makes room: aside (desktop) or upward (phone). One source, and it is
   * FROZEN for the whole of BUILDING — rotating the device mid-build would redraw
   * the seam while the seam is still animating, which is a guaranteed layout jump
   * at the exact moment the page is supposed to be assembling itself. The build
   * finishes in the composition it started in (≤ 4s) and corrects on the first
   * frame after READY.
   */
  const mode = useCompositionMode(stage === "building");

  const applyLenoxState = useCallback((next: LenoxProofState) => {
    setState(next);
    dispatch({ type: "ENGINE", state: next });
  }, []);

  // The engine no longer has an opinion about the composition — it is told.
  useEffect(() => {
    bridgeRef.current?.setCompositionMode(mode);
  }, [mode]);

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

  /**
   * DIE KALIBRIERUNG misst das Spiel — still. Lokal, flüchtig, nie gesendet:
   * das Meter lebt in diesem Ref und stirbt mit der Session. Gemessen wird
   * nur vor dem Wake; ab dem ersten Wake-Frame ist die Messung eingefroren.
   */
  const playMeter = useRef(createPlayMeter());
  const stageRef = useRef<ReturnType<typeof stageReducer> | "dormant">(
    "dormant",
  );

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    bridge.setPointer(event.clientX, event.clientY, false);
    if (stageRef.current === "dormant") {
      playMeter.current.sample(
        event.clientX,
        event.clientY,
        event.pointerType,
        performance.now(),
      );
    }
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

  const onBuilt = useCallback(() => dispatch({ type: "BUILT" }), []);

  /**
   * Akt III → IV: die Frage ist beantwortet, sein Satz gesprochen. Die
   * gewählte Welt liegt im Ref (kein Re-Render nötig — die Verwandlung liest
   * sie genau einmal), der Reducer schaltet auf `transforming`.
   */
  const chosenSignature = useRef<LenoxSignatureId>("obsidian");
  const onCommitSignature = useCallback((id: LenoxSignatureId) => {
    chosenSignature.current = id;
    dispatch({ type: "SPOKEN" });
  }, []);

  /**
   * Weg A: die Kammer hat gemessen; die Wahl ist deterministisch — und sie
   * wählt NIE die Welt, in der der Besucher schon steht (das Gesetz aus dem
   * Video-Verdikt: der Signature-Moment muss sichtbar sein).
   */
  const resolveLenoxChoice = useCallback(
    () =>
      decideSignature(
        playMeter.current.finish(),
        new Date().getHours(),
        chosenSignature.current,
      ),
    [],
  );

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
   * Shot-Freeze (?shotdev) — das Previz-Werkzeug der Art-Direction-Rescue:
   * Keyframes werden im ECHTEN Renderer komponiert, eingefroren,
   * geschossen. Bewusst NUR eine Sammlung von Bridge-Aufrufen (die Bridge
   * ist der sanktionierte Zustands-Eingang) — kein zweiter State-Owner,
   * kein Roh-Zugriff auf App-Interna. Nicht Teil der Experience.
   */
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("shotdev")) return;
    const g = globalThis as Record<string, unknown>;
    g.__LENOX_SHOT__ = {
      wake,
      emotion: (e: LenoxEmotion) => onEmotion(e),
      gaze: (x: number, y: number) => {
        gazeScripted.current = !(x === 0 && y === 0);
        bridgeRef.current?.setLenoxGaze(x, y);
      },
      target: (id: LenoxSignatureId) =>
        bridgeRef.current?.setSignatureTarget(id),
      progress: (p: number) => bridgeRef.current?.setTransformProgress(p),
      commit: () => bridgeRef.current?.commitSignature(),
      pose: (pose: StationPose, tau?: number) =>
        bridgeRef.current?.setJourneyPose(pose, tau),
      operator: (t: number) => bridgeRef.current?.setLenoxOperator(t, 0.4),
    };
    return () => {
      delete g.__LENOX_SHOT__;
    };
  }, [wake, onEmotion]);

  // The workspace may fire ONE reaction legitimately: the amber confirm, and
  // only for a result that really happened (the contact transmission). The
  // drive owns the overlay; this is a straight pass-through.
  const onReaction = useCallback((reaction: LenoxReaction) => {
    bridgeRef.current?.setLenoxReaction(reaction);
  }, []);

  /**
   * Der Director sagt, welche Station führt; hier passiert nur der Blick:
   * ein kurzer Glance zur Arbeit ("work") und zurück, oder sofortige
   * Freigabe an den Besucher. Die Emotion setzt die Station selbst — der
   * Glance darf sie nicht überschreiben.
   *
   * The return timer is single: scroll through three stations quickly and
   * old timers would fire mid-glance, yanking his eyes around.
   */
  const glanceBack = useRef<number | null>(null);
  const onStationChange = useCallback(
    (_region: string, glance: "work" | "visitor") => {
      const bridge = bridgeRef.current;
      if (!bridge) return;
      if (glanceBack.current !== null) window.clearTimeout(glanceBack.current);

      if (glance === "visitor") {
        gazeScripted.current = false;
        bridge.setLenoxGaze(0, 0);
        glanceBack.current = null;
        return;
      }

      gazeScripted.current = true;
      bridge.setLenoxGaze(0.38, -0.02);
      glanceBack.current = window.setTimeout(() => {
        bridge.setLenoxGaze(0, 0);
        gazeScripted.current = false;
        glanceBack.current = null;
      }, 900);
    },
    [],
  );

  /** Scroll-Director → Engine-Kamera. Die Engine east; hier nur Durchgabe. */
  const onPose = useCallback((pose: StationPose, tau: number) => {
    bridgeRef.current?.setJourneyPose(pose, tau);
  }, []);

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

  /**
   * AKT IV — die Verwandlung läuft, sobald der Reducer `transforming` sagt.
   * Eine Uhr (transformTimeline) treibt Drive-Puls, Scan-Uniform und
   * DOM-Tokens; am Ende meldet sie TRANSFORMED und der Build übernimmt.
   */
  useEffect(() => {
    if (stage !== "transforming") return;
    const bridge = bridgeRef.current;
    if (!bridge) {
      dispatch({ type: "TRANSFORMED" });
      return;
    }
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const tl = transformTimeline(
      chosenSignature.current,
      {
        setSignatureInstant: (id) => bridge.setSignature(id),
        setSignatureTarget: (id) => bridge.setSignatureTarget(id),
        setTransformProgress: (p) => bridge.setTransformProgress(p),
        commitSignature: () => bridge.commitSignature(),
        onEmotion,
        onDone: () => dispatch({ type: "TRANSFORMED" }),
      },
      reduced,
    );
    return () => {
      tl.kill();
    };
  }, [stage, onEmotion]);

  const preWake = PRE_WAKE.includes(state);
  const built = stage === "building" || stage === "ready";

  return (
    <div
      className="lenox-stage"
      data-composition={mode}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
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
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            /**
             * The touch lock belongs HERE, on the canvas, and nowhere above it.
             *
             * It used to sit on the stage root with a comment claiming the
             * workspace "takes it back" with `pan-y`. It cannot. A touch gesture
             * is only permitted if it is allowed by the hit element AND every
             * ancestor up to the scrolling container — so `none` on the shared
             * parent silently killed scrolling in the workspace and the rail on
             * every real phone. The emulator never showed it, because a synthetic
             * pointer is not a finger.
             */
            touchAction: "none",
          }}
        />
      )}

      <CornerHud
        stage={stage}
        gpu={gpuPath}
        mode={mode}
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

      {/* He has found you. One sentence, then THE question — and both answers
          end in the same transformation. Mounted through recognition only;
          the moment the world starts changing, the line has done its job. */}
      {stage === "recognition" ? (
        <FirstContact
          m={m}
          locale={locale}
          onSpeechStart={onSpeechStart}
          onEmotion={onEmotion}
          resolveLenoxChoice={resolveLenoxChoice}
          onCommit={onCommitSignature}
        />
      ) : null}

      {/* Mounted for BUILDING and never unmounted. What he built has to still be
          standing afterwards, or the build was a cutscene — and from READY on
          it is a JOURNEY: the page scrolls, the camera travels, he companions. */}
      {built ? (
        <Journey
          m={m}
          locale={locale}
          mode={mode}
          building={stage === "building"}
          onOperator={onOperator}
          onGaze={onGaze}
          onEmotion={onEmotion}
          onReaction={onReaction}
          onPose={onPose}
          onBuilt={onBuilt}
          onStationChange={onStationChange}
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
