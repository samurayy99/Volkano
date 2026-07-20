"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { FlowEngineBridge } from "../flow-engine/engineBridge";
import type {
  LenoxEmotion,
  LenoxProofState,
  LenoxReaction,
  LenoxSignals,
  LenoxSignatureId,
} from "../flow-engine/types";
import { useLocale } from "../i18n/useLocale";
import { FallbackEyes } from "./FallbackEyes";
import { createPlayMeter } from "./stage/calibration";
import { useCompositionMode } from "./stage/compositionMode";
import { CornerHud } from "./stage/CornerHud";
import { createFilmScrubber, type FilmScrubber } from "./stage/filmScrubber";
import { FirstContact } from "./stage/FirstContact";
import { Journey } from "./stage/Journey";
import { stageReducer } from "./stage/stageState";
import type { StationPose } from "./stage/stations";

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
  const stageRootRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<FlowEngineBridge | null>(null);
  const filmRef = useRef<HTMLVideoElement | null>(null);
  const filmScrubberRef = useRef<FilmScrubber | null>(null);

  const [gpuPath, setGpuPath] = useState<"webgpu" | "fallback" | "probing">(
    "probing",
  );
  const [state, setState] = useState<LenoxProofState>("idle");
  const [emotion, setEmotion] = useState<LenoxEmotion>("neutral");
  const [eyeRigEnhanced, setEyeRigEnhanced] = useState(false);

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
   * FROZEN for the whole creation transaction. Rotating mid-collapse would move
   * the fall axis and typography targets while matter is still in flight. The
   * composition corrects after Arrival, once the director owns the settled page.
   */
  const mode = useCompositionMode(stage === "transforming" || stage === "building");
  const [creationReduced, setCreationReduced] = useState(false);

  const applyLenoxState = useCallback((next: LenoxProofState) => {
    setState(next);
    dispatch({ type: "ENGINE", state: next });
  }, []);

  const writeLenoxSignals = useCallback((signals: LenoxSignals) => {
    const root = stageRootRef.current;
    if (!root) return;
    root.style.setProperty("--lenox-energy", signals.energy.toFixed(4));
    root.style.setProperty("--lenox-attention", signals.attention.toFixed(4));
    root.style.setProperty("--lenox-tension", signals.tension.toFixed(4));
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
      onLenoxSignals: writeLenoxSignals,
      onError: (error) => {
        console.error("[lenox] engine error", error);
      },
      onDeviceLost: (info) => {
        console.warn("[lenox] WebGPU device lost; committing static GRAVITY", info);
        bridgeRef.current?.dispose();
        bridgeRef.current = null;
        setGpuPath("fallback");
        dispatch({ type: "STATIC_FALLBACK" });
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
  }, [applyLenoxState, writeLenoxSignals]);

  // Product phases state intent once. The engine owns every delayed response.
  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    if (stage === "transforming") bridge.setLenoxIntent({ kind: "rest" });
    else if (stage === "recognition" || stage === "building" || stage === "ready") {
      bridge.setLenoxIntent({ kind: "observe" });
    }
  }, [stage]);

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

      if (event.key === "i" || event.key === "I") {
        setEyeRigEnhanced((current) => {
          const next = !current;
          bridge.setLenoxEyeRigEnhanced(next);
          return next;
        });
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
    // iOS-Unlock für den Welt-Film: Safari rendert Frames eines pausierten,
    // nie gestarteten <video> nicht — currentTime-Scrubbing zeigt dann eine
    // schwarze Fläche. Ein play().pause() innerhalb DIESER User-Geste (der
    // einzigen vor der Journey) schaltet die Frame-Präsentation frei.
    const film = filmRef.current;
    film?.play().then(() => film.pause()).catch(() => {});
    bridge.setLenoxState("waking");
    applyLenoxState("waking");
  }, [applyLenoxState]);

  const onBuilt = useCallback(() => dispatch({ type: "BUILT" }), []);

  /** First Contact is complete. Snapshot motion preference for THE COLLAPSE. */
  const onCommitSignature = useCallback(() => {
    setCreationReduced(window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches);
    dispatch({ type: "SPOKEN" });
  }, []);

  /** LENOX reads the local play meter, but GRAVITY is his canonical decision. */
  const resolveLenoxChoice = useCallback(() => {
    const metrics = playMeter.current.finish();
    const played = metrics.samples >= 40 && metrics.activeMs >= 1200;
    return {
      // First Contact still speaks the historical internal type. GRAVITY
      // itself never receives or renders a signature id.
      id: "obsidian" as const,
      reason: played
        ? {
            de: "Du hast die Materie bewegt. Ich gebe ihr Gewicht.",
            en: "You moved the matter. I will give it weight.",
          }
        : {
            de: "Du hast die Materie ruhen lassen. Ich gebe ihr Gewicht.",
            en: "You left the matter still. I will give it weight.",
          },
    };
  }, []);

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
      intent: (intent: Parameters<FlowEngineBridge["setLenoxIntent"]>[0]) =>
        bridgeRef.current?.setLenoxIntent(intent),
      eyes: (enhanced: boolean) => {
        bridgeRef.current?.setLenoxEyeRigEnhanced(enhanced);
        setEyeRigEnhanced(enhanced);
      },
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
        bridge.setLenoxIntent({ kind: "observe" });
        gazeScripted.current = false;
        bridge.setLenoxGaze(0, 0);
        glanceBack.current = null;
        return;
      }

      gazeScripted.current = true;
      bridge.setLenoxIntent({
        kind: "guide",
        arm: _region === "systems" ? "left" : "right",
        targetNdc: { x: 0.38, y: -0.02 },
        reach: _region === "work" ? 0.9 : 0.68,
      });
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

  const preWake = PRE_WAKE.includes(state);
  const journeyMounted =
    stage === "recognition" ||
    stage === "transforming" ||
    stage === "building" ||
    stage === "ready";
  const onCreationProgress = useCallback((progress: number, reduced: boolean) => {
    bridgeRef.current?.setGravityCreationProgress(progress, reduced);
  }, []);
  const onGravityCreated = useCallback(() => dispatch({ type: "TRANSFORMED" }), []);
  const onScrollProgress = useCallback((progress: number, clipAProgress: number) => {
    bridgeRef.current?.setGravityScrollProgress(progress);
    filmScrubberRef.current?.setProgress(clipAProgress);
  }, []);

  // Der Welt-Film existiert als Scrubber nur, solange die Journey der einzige
  // Scroller ist; sein Fortschritt kommt aus demselben Director-Callback wie
  // der der Engine — eine Scroll-Wahrheit, kein zweiter Listener.
  useEffect(() => {
    if (stage !== "ready") return;
    const video = filmRef.current;
    if (!video) return;
    const scrubber = createFilmScrubber(video);
    filmScrubberRef.current = scrubber;
    return () => {
      filmScrubberRef.current = null;
      scrubber.dispose();
    };
  }, [stage]);

  return (
    <div
      ref={stageRootRef}
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
      {/* WORLD (hinterste Ebene des Hybrids): der scroll-gescrubte Film.
          LENOX wird NIE ins Video gebacken — er lebt live auf dem Canvas
          darüber (zIndex 1). Sichtbar erst, wenn die Journey übernommen hat. */}
      <video
        ref={filmRef}
        src="/flow-assets/gravity-clip-a-v2-dense.mp4"
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: 0,
          pointerEvents: "none",
          opacity: stage === "ready" ? 1 : 0,
          transition: "opacity 600ms ease",
        }}
      />

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

      {/* Mounted invisibly during First Contact for font/layout readiness, then
          kept alive through creation and the single authoritative journey. */}
      {journeyMounted ? (
        <Journey
          m={m}
          locale={locale}
          mode={mode}
          armed={stage === "recognition"}
          creating={stage === "transforming"}
          building={stage === "building"}
          reduced={creationReduced}
          onCreationProgress={onCreationProgress}
          onCreated={onGravityCreated}
          onOperator={onOperator}
          onGaze={onGaze}
          onEmotion={onEmotion}
          onReaction={onReaction}
          onPose={onPose}
          onBuilt={onBuilt}
          onStationChange={onStationChange}
          onScrollProgress={onScrollProgress}
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
          <button
            type="button"
            aria-pressed={eyeRigEnhanced}
            style={expressionButton(eyeRigEnhanced)}
            onClick={() => {
              const next = !eyeRigEnhanced;
              bridgeRef.current?.setLenoxEyeRigEnhanced(next);
              setEyeRigEnhanced(next);
            }}
          >
            eye rig {eyeRigEnhanced ? "enhanced" : "control"}
          </button>
        </div>
      ) : null}

    </div>
  );
}
