"use client";

import {
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
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
} from "../convergence";
import { FlowEngineHost } from "../flow-engine";
import type {
  FlowEngineApi,
  FlowEngineFrontRailMetrics,
} from "../flow-engine/types";

type RoomPhase = "source" | "rotating" | "backface" | "interface";
const ROOM_ROTATION_DURATION_MS = 1900;
const ROOM_BACKFACE_SETTLE_DURATION_MS = 600;
const TRIGGER_HEIGHT_RATIO = 0.72;
const TRIGGER_WIDTH_RATIO = 0.115;
const TRIGGER_VERTICAL_BIAS_RATIO = 0.02;
const ROOM_TIMING_STYLE: CSSProperties = {
  "--rotation-duration": `${ROOM_ROTATION_DURATION_MS}ms`,
  "--hero-land-duration": `${ROOM_BACKFACE_SETTLE_DURATION_MS}ms`,
} as CSSProperties;

export function SpatialChamber() {
  const reducedMotion = useReducedMotionPreference();
  const backScrollRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const engineBridgeRef = useRef<ReturnType<
    typeof createConvergenceEngineBridge
  > | null>(null);
  const [controller] = useState<ConvergenceController>(() =>
    createConvergenceController(),
  );
  const [engineFailed, setEngineFailed] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [roomPhase, setRoomPhase] = useState<RoomPhase>("source");
  const roomFrameRef = useRef<number | null>(null);
  const roomPhaseStartedAtRef = useRef(0);
  const roomPhaseRef = useRef<RoomPhase>("source");
  roomPhaseRef.current = roomPhase;

  const isFrontPointerActive =
    !reducedMotion &&
    roomPhase === "source" &&
    getSourceInteractive(snapshot);
  const isBackPointerActive = roomPhase === "interface";
  const shouldMountEngine = !reducedMotion && !engineFailed;
  /** Without this, `.chamber-stage` stays opacity:0 until WebGPU `onReady` — hangs, no-GPU, or failed init never call `onReady`. */
  const sourceShellVisible =
    roomPhase === "source" && (engineReady || !shouldMountEngine);

  useEffect(() => {
    engineBridgeRef.current?.sync(snapshot);
  }, [snapshot]);

  useEffect(() => {
    if (snapshot.progress < 100 && roomPhase !== "source") {
      roomPhaseStartedAtRef.current = 0;
      setRoomPhase("source");
    }
  }, [roomPhase, snapshot.progress]);

  /** Backface → interface only (rotation end is tied to CSS `chamber-rotate` end, not wall-clock RAF). */
  useEffect(() => {
    if (roomFrameRef.current != null) {
      window.cancelAnimationFrame(roomFrameRef.current);
      roomFrameRef.current = null;
    }

    if (roomPhase !== "backface") {
      return;
    }

    const phaseStartedAt =
      roomPhaseStartedAtRef.current > 0
        ? roomPhaseStartedAtRef.current
        : performance.now();
    roomPhaseStartedAtRef.current = phaseStartedAt;

    const tick = (now: number) => {
      const elapsed = now - phaseStartedAt;

      if (elapsed >= ROOM_BACKFACE_SETTLE_DURATION_MS) {
        roomPhaseStartedAtRef.current = performance.now();
        setRoomPhase("interface");
        roomFrameRef.current = null;
        return;
      }

      roomFrameRef.current = window.requestAnimationFrame(tick);
    };

    roomFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (roomFrameRef.current != null) {
        window.cancelAnimationFrame(roomFrameRef.current);
        roomFrameRef.current = null;
      }
    };
  }, [roomPhase]);

  useEffect(() => {
    const scrollNode = backScrollRef.current;
    if (!scrollNode || roomPhase === "source") return;

    const frameId = window.requestAnimationFrame(() => {
      scrollNode.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [roomPhase]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || reducedMotion) return;

    const handler = (event: PointerEvent) => {
      if (!isFrontPointerActive || roomPhase !== "source") return;
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      el.style.setProperty("--mouse-x", nx.toFixed(3));
      el.style.setProperty("--mouse-y", ny.toFixed(3));
    };

    el.addEventListener("pointermove", handler, { passive: true });
    return () => el.removeEventListener("pointermove", handler);
  }, [isFrontPointerActive, reducedMotion, roomPhase]);

  return (
    <div
      className="site-root"
      ref={rootRef}
      style={ROOM_TIMING_STYLE}
      data-room-phase={roomPhase}
      data-front-interactive={isFrontPointerActive ? "true" : "false"}
      data-back-interactive={isBackPointerActive ? "true" : "false"}
      data-engine-ready={engineReady ? "true" : undefined}
      data-source-shell-visible={sourceShellVisible ? "true" : undefined}
    >
      <div className="cube-wrapper">
        <div className="chamber-stage">
          <div className="chamber-aperture">
            <div
              className="cube"
              onAnimationEnd={(event: ReactAnimationEvent<HTMLDivElement>) => {
                if (
                  event.currentTarget !== event.target ||
                  event.animationName !== "chamber-rotate"
                ) {
                  return;
                }
                if (roomPhaseRef.current !== "rotating") {
                  return;
                }
                roomPhaseStartedAtRef.current = performance.now();
                setRoomPhase("backface");
              }}
            >
              <FrontFace
                controller={controller}
                mountEngine={shouldMountEngine && !engineFailed}
                triggerVisible={
                  shouldMountEngine &&
                  !engineFailed &&
                  roomPhase === "source"
                }
                triggerDisabled={roomPhase !== "source"}
                onEngineReady={(api) => {
                  engineBridgeRef.current = createConvergenceEngineBridge(api);
                  engineBridgeRef.current.sync(snapshot);
                  requestAnimationFrame(() => setEngineReady(true));
                }}
                onRotationReady={() => {
                  roomPhaseStartedAtRef.current = performance.now();
                  setRoomPhase(reducedMotion ? "interface" : "rotating");
                }}
                onEngineError={() => {
                  setEngineFailed(true);
                }}
              />

              <BackFace scrollRef={backScrollRef} />
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
  mountEngine,
  triggerVisible,
  triggerDisabled,
  onEngineReady,
  onRotationReady,
  onEngineError,
}: {
  controller: ConvergenceController;
  mountEngine: boolean;
  triggerVisible: boolean;
  triggerDisabled: boolean;
  onEngineReady: (api: FlowEngineApi) => void;
  onRotationReady: () => void;
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
              onRotationReady={onRotationReady}
              onError={onEngineError}
            />
          ) : (
            <div className="front-engine-fallback" aria-hidden="true" />
          )}
          {mountEngine && triggerAnchorReady ? (
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
  scrollRef,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
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
