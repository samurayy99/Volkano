"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { FlowEngineHost } from "../flow-engine";
import type {
  ConversationState,
  FlowEngineApi,
  PostEnterDebugSnapshot,
  PostEnterStage,
} from "../flow-engine/types";
import { ShowroomPanel } from "./showroom/ShowroomPanel";
import { useScenarioPlayer } from "./showroom/useScenarioPlayer";

/** Chamber always reads as the same room; post-enter uses `data-post-enter-*` only. */
const ROOM_PHASE = "source" as const;
const REVEAL_STAGES = new Set<PostEnterStage>([
  "quiet",
  "push_in",
  "page_lock",
  "hero",
]);

export function SpatialChamber() {
  const reducedMotion = useReducedMotionPreference();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const engineApiRef = useRef<FlowEngineApi | null>(null);
  const postEnterStageRef = useRef<PostEnterStage>("none");
  const [engineFailed, setEngineFailed] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [postEnterStage, setPostEnterStage] = useState<PostEnterStage>("none");
  const postEnterActive = postEnterStage !== "none";

  const shouldMountEngine = !reducedMotion && !engineFailed;
  const isFrontPointerActive =
    !reducedMotion && shouldMountEngine && !postEnterActive;

  const {
    playback: scenarioPlayback,
    play: playScenario,
    reset: resetScenario,
    abort: abortScenario,
  } = useScenarioPlayer(engineApiRef);
  const scenarioActive = scenarioPlayback.playing || scenarioPlayback.done;
  // Scenario runs live in the source view; the Enter film stays the one-time
  // activation ritual and is hidden while a scenario owns the chamber.
  const showShowroom = engineReady && shouldMountEngine && !postEnterActive;
  /**
   * Keep `.chamber-stage` visible after WebGPU `onReady`, when the engine is intentionally off
   * (reduced motion / failed init), and **during post-enter** so a transient `onError` (e.g.
   * device loss) does not drop `data-source-shell-visible` and hide the whole cube shell.
   */
  const sourceShellVisible =
    engineReady || !shouldMountEngine || postEnterActive;

  const postEnterDebugHandler =
    process.env.NODE_ENV === "development"
      ? (snap: PostEnterDebugSnapshot) => {
          console.debug("[volkano post-enter]", snap);
        }
      : undefined;

  const backwallAuthority = reducedMotion || REVEAL_STAGES.has(postEnterStage);
  const backInterfaceReady = reducedMotion || postEnterStage === "hero";
  const backContentHidden = !backInterfaceReady;

  const setPostEnterStageTracked = useCallback((stage: PostEnterStage) => {
    postEnterStageRef.current = stage;
    setPostEnterStage(stage);
  }, []);

  const resetPointerParallax = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty("--mouse-x", "0");
    el.style.setProperty("--mouse-y", "0");
  }, []);

  useEffect(() => {
    engineApiRef.current?.setInteractiveEnabled(shouldMountEngine);
  }, [engineReady, shouldMountEngine]);

  useEffect(() => {
    if (!postEnterActive) return;
    resetPointerParallax();
  }, [postEnterActive, resetPointerParallax]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || reducedMotion) return;

    const handler = (event: PointerEvent) => {
      if (!isFrontPointerActive) return;
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      el.style.setProperty("--mouse-x", nx.toFixed(3));
      el.style.setProperty("--mouse-y", ny.toFixed(3));
    };

    el.addEventListener("pointermove", handler, { passive: true });
    return () => el.removeEventListener("pointermove", handler);
  }, [isFrontPointerActive, reducedMotion]);

  return (
    <div
      className="site-root"
      ref={rootRef}
      data-room-phase={ROOM_PHASE}
      data-front-interactive={isFrontPointerActive ? "true" : "false"}
      data-post-enter-active={postEnterActive ? "true" : undefined}
      data-post-enter-stage={
        postEnterStage === "none" ? undefined : postEnterStage
      }
      data-back-interface-ready={backInterfaceReady ? "true" : undefined}
      data-backwall-authority={backwallAuthority ? "true" : undefined}
      data-engine-ready={engineReady ? "true" : undefined}
      data-source-shell-visible={sourceShellVisible ? "true" : undefined}
      data-volkano-flow={
        reducedMotion
          ? "engine-off-reduced-motion"
          : engineFailed
            ? "engine-failed"
            : engineReady
              ? "engine-live"
              : "engine-loading"
      }
    >
      <div className="cube-wrapper">
        <div className="chamber-stage">
          <div className="chamber-aperture">
            <div className="cube">
              <FrontFace
                engineEnabled={shouldMountEngine}
                showEnterControl={
                  engineReady &&
                  shouldMountEngine &&
                  !postEnterActive &&
                  !scenarioActive
                }
                onEnter={() => {
                  abortScenario();
                  resetPointerParallax();
                  // First `drivePostEnter(0)` beat is always `impact`; keep ref in sync before
                  // the next paint so a same-tick engine error does not unmount the host.
                  postEnterStageRef.current = "impact";
                  engineApiRef.current?.beginPostEnter();
                }}
                onEngineReady={(api) => {
                  engineApiRef.current = api;
                  if (process.env.NODE_ENV === "development") {
                    // Dev console escape hatch (same convention as __VOLKANO_FORENSIC__):
                    // `__VOLKANO_ENGINE__.resetCycle()` re-arms the chamber after a run.
                    (
                      globalThis as { __VOLKANO_ENGINE__?: FlowEngineApi }
                    ).__VOLKANO_ENGINE__ = api;
                  }
                  api.setInteractiveEnabled(shouldMountEngine);
                  requestAnimationFrame(() => setEngineReady(true));
                }}
                onEngineError={(err) => {
                  // Do not unmount FlowEngineHost mid-sequence: bridge `catch` would drop the
                  // canvas and leave only `.front-engine-fallback` (reads as “black / no chamber”).
                  if (postEnterStageRef.current !== "none") {
                    console.error(
                      "[SpatialChamber] engine error during post-enter",
                      err,
                    );
                    return;
                  }
                  setEngineFailed(true);
                }}
                onPostEnterStageChange={setPostEnterStageTracked}
                onPostEnterDebugSnapshot={postEnterDebugHandler}
              />

              <BackFace contentHidden={backContentHidden} />
              <WallFace className="cube-face cube-face-left" />
              <WallFace className="cube-face cube-face-right" />
              <WallFace className="cube-face cube-face-top" />
              <WallFace className="cube-face cube-face-bottom" />
            </div>
          </div>
        </div>
      </div>
      {showShowroom ? (
        <ShowroomPanel
          playback={scenarioPlayback}
          onSimulate={playScenario}
          onReset={resetScenario}
        />
      ) : null}
      {process.env.NODE_ENV === "development" ? (
        <DevChamberControls engineApiRef={engineApiRef} />
      ) : null}
    </div>
  );
}

const DEV_STATE_KEYS: Record<string, ConversationState> = {
  "1": "dormant",
  "2": "listening",
  "3": "processing",
  "4": "speaking",
  "5": "resolution",
};

/** Dev-only chamber signal keypad: 1–5 states, R reset, +/- energy. */
function DevChamberControls({
  engineApiRef,
}: {
  engineApiRef: React.RefObject<FlowEngineApi | null>;
}) {
  const [state, setState] = useState<ConversationState>("dormant");
  const [energy, setEnergy] = useState(0);
  const energyRef = useRef(0);

  useEffect(() => {
    const applyEnergy = (next: number) => {
      const clamped = Math.min(1, Math.max(0, Math.round(next * 10) / 10));
      energyRef.current = clamped;
      setEnergy(clamped);
      engineApiRef.current?.setChamberEnergy(clamped);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const api = engineApiRef.current;
      if (!api) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const nextState = DEV_STATE_KEYS[event.key];
      if (nextState) {
        // Speaking without energy shows no pulse; give it a sensible default.
        if (nextState === "speaking" && energyRef.current === 0) {
          applyEnergy(0.8);
        }
        api.setConversationState(nextState);
        setState(nextState);
        return;
      }

      if (event.key === "r" || event.key === "R") {
        api.resetCycle();
        setState("dormant");
        applyEnergy(0);
        return;
      }
      if (event.key === "+" || event.key === "=") {
        applyEnergy(energyRef.current + 0.1);
        return;
      }
      if (event.key === "-" || event.key === "_") {
        applyEnergy(energyRef.current - 0.1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engineApiRef]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 9999,
        pointerEvents: "none",
        font: "11px/1.5 ui-monospace, monospace",
        letterSpacing: "0.08em",
        color: "#d8c9b8",
        background: "rgba(0, 0, 0, 0.55)",
        padding: "6px 10px",
        borderRadius: 4,
      }}
    >
      STATE {state.toUpperCase()} · ENERGY {energy.toFixed(1)}
      <br />
      <span style={{ opacity: 0.55 }}>1–5 states · R reset · +/- energy</span>
    </div>
  );
}

function FrontFace({
  engineEnabled,
  showEnterControl,
  onEnter,
  onEngineReady,
  onEngineError,
  onPostEnterStageChange,
  onPostEnterDebugSnapshot,
}: {
  /** WebGPU host mounted and pointer gating follows this flag. */
  engineEnabled: boolean;
  showEnterControl: boolean;
  onEnter: () => void;
  onEngineReady: (api: FlowEngineApi) => void;
  onEngineError: (error: unknown) => void;
  onPostEnterStageChange?: (stage: PostEnterStage) => void;
  onPostEnterDebugSnapshot?: (snapshot: PostEnterDebugSnapshot) => void;
}) {
  return (
    <section className="cube-face cube-face-front" aria-label="Source chamber">
      <div className="front-source">
        <div className="front-source-host">
          {engineEnabled ? (
            <FlowEngineHost
              className="flow-engine-host front-flow-host"
              syncInteractiveFromHost={() => ({
                interactiveEnabled: engineEnabled,
              })}
              onPostEnterStageChange={onPostEnterStageChange}
              onPostEnterDebugSnapshot={onPostEnterDebugSnapshot}
              onReady={onEngineReady}
              onError={onEngineError}
            />
          ) : (
            <div className="front-engine-fallback" aria-hidden="true" />
          )}
        </div>
        {showEnterControl ? (
          <div className="chamber-enter-wrap">
            <button
              type="button"
              className="chamber-enter-btn"
              onClick={onEnter}
            >
              Enter
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function BackFace({ contentHidden }: { contentHidden: boolean }) {
  return (
    <section
      className="cube-face cube-face-back"
      aria-label="Hero wall"
      aria-hidden={contentHidden ? true : undefined}
      inert={contentHidden ? true : undefined}
    >
      <div className="back-surface">
        <header className="back-chrome">
          <span className="back-brand">VOLKANO</span>
          <a
            className="back-cta"
            href="mailto:hello@volkano.dev?subject=Book%20a%20Call"
          >
            Book a Call
          </a>
        </header>

        <div className="back-scroll">
          <section className="back-hero">
            <h2>Built under pressure.</h2>
          </section>

          <div className="back-grid">
            <article className="back-panel">
              <p className="back-panel-label">Services</p>
              <ul className="back-list">
                <li>High-conviction websites with motion restraint</li>
                <li>AI integration that changes actual operations</li>
                <li>Custom frontends with real-time graphics</li>
              </ul>
            </article>

            <article className="back-panel">
              <p className="back-panel-label">Evidence</p>
              <ul className="back-list">
                <li>WebGPU and shader-driven interaction</li>
                <li>Production-grade React and Next architecture</li>
                <li>Design systems built for pressure, not novelty</li>
              </ul>
            </article>

            <article className="back-panel">
              <p className="back-panel-label">Contact</p>
              <ul className="back-list back-list-contact">
                <li>
                  <a href="mailto:hello@volkano.dev">hello@volkano.dev</a>
                </li>
                <li>Zurich / Remote</li>
                <li>Available for focused build engagements</li>
              </ul>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}

function WallFace({ className }: { className: string }) {
  return <div className={className} aria-hidden="true" />;
}

function useReducedMotionPreference() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}

function subscribeToReducedMotion(onChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);

  return () => {
    query.removeEventListener("change", onChange);
  };
}

function getReducedMotionSnapshot() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}
