"use client";

import {
  type AnimationEvent as ReactAnimationEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ConvergenceTrigger,
  createConvergenceController,
  createConvergenceEngineBridge,
  getSourceInteractive,
  type ConvergenceController,
  type ConvergenceSnapshot,
} from "../convergence";
import { FlowEngineHost } from "../flow-engine";
import type {
  FlowEngineApi,
  FlowEngineFrontRailMetrics,
} from "../flow-engine/types";

type RoomPhase = "source" | "rotating" | "back";
const FREEZE_FALLBACK_MS = 2500;
const TRIGGER_HEIGHT_RATIO = 0.72;
const TRIGGER_WIDTH_RATIO = 0.115;
const TRIGGER_VERTICAL_BIAS_RATIO = 0.02;

export function SpatialChamber() {
  const reducedMotion = useReducedMotionPreference();
  const backScrollRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const engineBridgeRef = useRef<ReturnType<
    typeof createConvergenceEngineBridge
  > | null>(null);
  const controllerRef = useRef<ConvergenceController | null>(null);
  const [engineFailed, setEngineFailed] = useState(false);
  const [engineReady, setEngineReady] = useState(false);

  if (controllerRef.current === null) {
    controllerRef.current = createConvergenceController();
  }

  const controller = controllerRef.current;
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  const roomPhase = getRoomPhase(snapshot);
  const view: RoomPhase =
    reducedMotion && snapshot.rotationComplete ? "back" : roomPhase;
  const rotationActive = snapshot.rotationActive;
  const rotationComplete = snapshot.rotationComplete;
  const heroLanded = snapshot.heroLanded;
  const interfaceActive = snapshot.interfaceActive;
  const isFrontPointerActive =
    !reducedMotion &&
    view === "source" &&
    getSourceInteractive(snapshot);
  const isBackPointerActive = view === "back" && interfaceActive;
  const shouldMountEngine = !reducedMotion && !engineFailed;
  /** Without this, `.chamber-stage` stays opacity:0 until WebGPU `onReady` — hangs, no-GPU, or failed init never call `onReady`. */
  const sourceShellVisible =
    view === "source" && (engineReady || !shouldMountEngine);

  // Safety fallback: if convergence settled but rotation never triggered, start after timeout
  useEffect(() => {
    if (
      !snapshot.convergenceSettled ||
      snapshot.rotationActive ||
      snapshot.rotationComplete
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      controller.startRotation();
    }, FREEZE_FALLBACK_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    controller,
    snapshot.convergenceSettled,
    snapshot.rotationActive,
    snapshot.rotationComplete,
  ]);

  // No-engine fallback: mark convergence settled after timeout
  useEffect(() => {
    if (
      snapshot.progress < 100 ||
      snapshot.convergenceSettled ||
      (!reducedMotion && shouldMountEngine && !engineFailed && engineReady)
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      controller.markConvergenceSettled();
    }, FREEZE_FALLBACK_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    controller,
    engineReady,
    engineFailed,
    reducedMotion,
    shouldMountEngine,
    snapshot.convergenceSettled,
    snapshot.progress,
  ]);

  // Reduced-motion bypass: no hero-wall-land animation fires, so mark landed directly
  useEffect(() => {
    if (!reducedMotion || !snapshot.rotationComplete || snapshot.heroLanded) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      controller.markHeroLanded();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [controller, reducedMotion, snapshot.rotationComplete, snapshot.heroLanded]);

  useEffect(() => {
    if (!snapshot.heroLanded || snapshot.interfaceActive) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      controller.markInterfaceActive();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [controller, snapshot.heroLanded, snapshot.interfaceActive]);

  useEffect(() => {
    engineBridgeRef.current?.sync(snapshot);
  }, [snapshot]);

  useEffect(() => {
    const scrollNode = backScrollRef.current;
    if (!scrollNode || !rotationComplete) return;

    const frameId = window.requestAnimationFrame(() => {
      scrollNode.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [rotationComplete]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || reducedMotion) return;

    const handler = (event: PointerEvent) => {
      if (!isFrontPointerActive || view !== "source") return;
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      el.style.setProperty("--mouse-x", nx.toFixed(3));
      el.style.setProperty("--mouse-y", ny.toFixed(3));
    };

    el.addEventListener("pointermove", handler, { passive: true });
    return () => el.removeEventListener("pointermove", handler);
  }, [isFrontPointerActive, reducedMotion, view]);

  return (
    <div
      className="site-root"
      ref={rootRef}
      data-phase={view}
      data-front-interactive={isFrontPointerActive ? "true" : "false"}
      data-back-interactive={isBackPointerActive ? "true" : "false"}
      data-view={view}
      data-engine-ready={engineReady ? "true" : undefined}
      data-source-shell-visible={sourceShellVisible ? "true" : undefined}
    >
      <div className="cube-wrapper">
        <div className="chamber-stage">
          <div className="chamber-aperture">
            <div
              className="cube"
              onAnimationEnd={(event) => {
                if (
                  event.currentTarget !== event.target ||
                  event.animationName !== "chamber-rotate" ||
                  !rotationActive
                ) {
                  return;
                }

                controller.completeRotation();
              }}
            >
              <FrontFace
                controller={controller}
                interactive={isFrontPointerActive}
                mountEngine={shouldMountEngine && !engineFailed}
                triggerVisible={
                  shouldMountEngine &&
                  !engineFailed &&
                  view === "source"
                }
                triggerDisabled={rotationActive || rotationComplete}
                onEngineReady={(api) => {
                  engineBridgeRef.current = createConvergenceEngineBridge(api);
                  engineBridgeRef.current.sync(snapshot);
                  requestAnimationFrame(() => setEngineReady(true));
                }}
                onPostEnterHoldStart={() => {
                  controller.markConvergenceSettled();
                }}
                onRiftReady={() => {
                  if (reducedMotion) {
                    window.requestAnimationFrame(() => {
                      controller.completeRotation();
                    });
                  }
                  controller.startRotation();
                }}
                onEngineError={() => {
                  setEngineFailed(true);
                }}
              />

              <BackFace
                interactive={isBackPointerActive}
                rotationComplete={rotationComplete}
                heroLanded={heroLanded}
                interfaceActive={interfaceActive}
                scrollRef={backScrollRef}
                onHeroSettled={() => {
                  controller.markHeroLanded();
                }}
              />
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
  controller,
  interactive,
  mountEngine,
  triggerVisible,
  triggerDisabled,
  onEngineReady,
  onPostEnterHoldStart,
  onRiftReady,
  onEngineError,
}: {
  controller: ConvergenceController;
  interactive: boolean;
  mountEngine: boolean;
  triggerVisible: boolean;
  triggerDisabled: boolean;
  onEngineReady: (api: FlowEngineApi) => void;
  onPostEnterHoldStart: () => void;
  onRiftReady: () => void;
  onEngineError: (error: unknown) => void;
}) {
  const triggerAnchorRef = useRef<HTMLDivElement | null>(null);
  const latestTriggerMetricsRef = useRef<FlowEngineFrontRailMetrics | null>(
    null,
  );
  const triggerAnchorReadyRef = useRef(false);
  const [triggerAnchorReady, setTriggerAnchorReady] = useState(false);

  useLayoutEffect(() => {
    if (!triggerAnchorReady) {
      return;
    }

    writeFrontRailAnchorStyle(
      triggerAnchorRef.current,
      latestTriggerMetricsRef.current,
    );
  }, [triggerAnchorReady]);

  useEffect(() => {
    if (mountEngine) {
      return;
    }

    latestTriggerMetricsRef.current = null;
    triggerAnchorReadyRef.current = false;
    setTriggerAnchorReady(false);
  }, [mountEngine]);

  return (
    <section className="cube-face cube-face-front" aria-label="Source chamber">
      <div className="front-source">
        <div className="front-source-host">
          {mountEngine ? (
            <FlowEngineHost
              className="flow-engine-host front-flow-host"
              onReady={onEngineReady}
              onFrontRailMetricsChange={(metrics) => {
                latestTriggerMetricsRef.current = metrics;
                writeFrontRailAnchorStyle(triggerAnchorRef.current, metrics);

                if (!triggerAnchorReadyRef.current) {
                  triggerAnchorReadyRef.current = true;
                  setTriggerAnchorReady(true);
                }
              }}
              onPostEnterHoldStart={onPostEnterHoldStart}
              onRiftReady={onRiftReady}
              onError={onEngineError}
            />
          ) : (
            <div className="front-engine-fallback" aria-hidden="true" />
          )}
          {triggerAnchorReady ? (
            <div
              ref={triggerAnchorRef}
              className="front-trigger-anchor"
              aria-hidden={triggerVisible ? undefined : true}
            >
              <ConvergenceTrigger
                controller={controller}
                visible={triggerVisible}
                disabled={triggerDisabled}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function getFrontRailAnchorGeometry(metrics: FlowEngineFrontRailMetrics) {
  const railWidth = Math.max(metrics.width, 1);
  const railHeight = Math.max(metrics.height, 1);
  const unclampedHeight = railHeight * TRIGGER_HEIGHT_RATIO;
  const moduleHeight = clampNumber(
    unclampedHeight,
    18,
    46,
  );
  const moduleWidth = clampNumber(
    railWidth * TRIGGER_WIDTH_RATIO,
    moduleHeight * 2.35,
    railWidth * 0.16,
  );
  const centerY = metrics.centerY + railHeight * TRIGGER_VERTICAL_BIAS_RATIO;
  const fontSize = clampNumber(moduleWidth * 0.095, 7.5, 12.5);
  const letterSpacing = clampNumber(moduleWidth * 0.028, 1.5, 3.2);

  return {
    left: `${metrics.centerX}px`,
    top: `${centerY}px`,
    moduleWidth: `${moduleWidth}px`,
    moduleHeight: `${moduleHeight}px`,
    fontSize: `${fontSize}px`,
    letterSpacing: `${letterSpacing}px`,
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function writeFrontRailAnchorStyle(
  node: HTMLDivElement | null,
  metrics: FlowEngineFrontRailMetrics | null,
) {
  if (!node || !metrics) {
    return;
  }

  const geometry = getFrontRailAnchorGeometry(metrics);

  node.style.left = geometry.left;
  node.style.top = geometry.top;
  node.style.width = "0px";
  node.style.height = "0px";
  node.style.setProperty("--trigger-module-width", geometry.moduleWidth);
  node.style.setProperty("--trigger-module-height", geometry.moduleHeight);
  node.style.setProperty("--trigger-label-size", geometry.fontSize);
  node.style.setProperty("--trigger-label-spacing", geometry.letterSpacing);
}

function BackFace({
  interactive,
  rotationComplete,
  heroLanded,
  interfaceActive,
  scrollRef,
  onHeroSettled,
}: {
  interactive: boolean;
  rotationComplete: boolean;
  heroLanded: boolean;
  interfaceActive: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onHeroSettled: () => void;
}) {
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

        <div className="back-scroll" ref={scrollRef}>
          <section
            className="back-hero"
            onAnimationEnd={(event: ReactAnimationEvent<HTMLElement>) => {
              if (
                event.currentTarget !== event.target ||
                event.animationName !== "hero-wall-land" ||
                !rotationComplete ||
                heroLanded ||
                interfaceActive
              ) {
                return;
              }

              onHeroSettled();
            }}
          >
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


function getRoomPhase(snapshot: ConvergenceSnapshot): RoomPhase {
  if (snapshot.rotationActive) return "rotating";
  if (snapshot.rotationComplete) return "back";
  return "source";
}
