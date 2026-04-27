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
  FlowEngineApi,
  PostEnterDebugSnapshot,
  PostEnterStage,
} from "../flow-engine/types";

/** Chamber always reads as the same room; post-enter uses `data-post-enter-*` only. */
const ROOM_PHASE = "source" as const;

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

  const backwallAuthority = false;

  const setPostEnterStageTracked = useCallback((stage: PostEnterStage) => {
    postEnterStageRef.current = stage;
    setPostEnterStage(stage);
  }, []);

  useEffect(() => {
    engineApiRef.current?.setInteractiveEnabled(shouldMountEngine);
  }, [engineReady, shouldMountEngine]);

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
      data-back-interface-ready={undefined}
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
                  engineReady && shouldMountEngine && !postEnterActive
                }
                onEnter={() => {
                  // First `drivePostEnter(0)` beat is always `impact`; keep ref in sync before
                  // the next paint so a same-tick engine error does not unmount the host.
                  postEnterStageRef.current = "impact";
                  engineApiRef.current?.beginPostEnter();
                }}
                onEngineReady={(api) => {
                  engineApiRef.current = api;
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

              <BackFace />
              <WallFace className="cube-face cube-face-left" />
              <WallFace className="cube-face cube-face-right" />
              <WallFace className="cube-face cube-face-top" />
              <WallFace className="cube-face cube-face-bottom" />
            </div>
          </div>
        </div>
      </div>
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

function BackFace() {
  return (
    <section
      className="cube-face cube-face-back"
      aria-label="Hero wall"
    >
      <div className="back-surface">
        <div className="back-scene-media" aria-hidden="true" />
        <div className="back-scene-haze" aria-hidden="true" />

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
