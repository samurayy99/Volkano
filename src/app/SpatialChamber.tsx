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
  getProofVisible,
  getRotationAllowed,
  getSourceInteractive,
  type ConvergenceController,
  type ConvergenceSnapshot,
} from "../convergence";
import { FlowEngineHost } from "../flow-engine";
import type {
  FlowEngineApi,
  FlowEngineDebugView,
  FlowEngineFrontRailMetrics,
} from "../flow-engine/types";

type RoomPhase = "source" | "rotating" | "back";
type ChamberPreview = "source" | "proof" | "back" | null;
const FREEZE_FALLBACK_MS = 420;
const PROOF_READY_FALLBACK_MS = 1320;
const PROOF_HOLD_MS = 1800;
const TRIGGER_BAND_FILL_RATIO = 0.86;

export function SpatialChamber() {
  const reducedMotion = useReducedMotionPreference();
  const chamberPreview = useChamberPreview();
  const vesselDebugView = useVesselDebugView();
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

  const proofPreview = chamberPreview === "proof";
  const previewView: RoomPhase | null =
    chamberPreview === "back"
      ? "back"
      : chamberPreview === "source" || proofPreview
        ? "source"
        : null;
  const roomPhase = getRoomPhase(snapshot);
  const view: RoomPhase =
    previewView ??
    (reducedMotion && snapshot.rotationComplete ? "back" : roomPhase);
  const proofVisible = proofPreview || getProofVisible(snapshot);
  const rotationActive =
    chamberPreview === null ? snapshot.rotationActive : false;
  const rotationComplete =
    chamberPreview === "back" ? true : snapshot.rotationComplete;
  const heroLanded = chamberPreview === "back" ? true : snapshot.heroLanded;
  const interfaceActive =
    chamberPreview === "back" ? true : snapshot.interfaceActive;
  const effectivePhase =
    chamberPreview === "back"
      ? "hero_landed"
      : proofPreview
        ? "proof"
        : snapshot.phase;
  const isFrontPointerActive =
    !reducedMotion &&
    previewView === null &&
    view === "source" &&
    getSourceInteractive(snapshot);
  const isBackPointerActive = view === "back" && interfaceActive;
  const shouldMountEngine =
    chamberPreview === null
      ? !reducedMotion && !engineFailed
      : chamberPreview !== "back" && !engineFailed;
  const showVesselDebug =
    process.env.NODE_ENV !== "production" &&
    view === "source" &&
    snapshot.phase === "source" &&
    !proofVisible;
  const rotationAllowed =
    chamberPreview === null && getRotationAllowed(snapshot);

  useEffect(() => {
    if (!snapshot.proofReady || snapshot.proofVisible || proofPreview) {
      return;
    }

    controller.showProof();
  }, [controller, proofPreview, snapshot.proofReady, snapshot.proofVisible]);

  useEffect(() => {
    if (
      !snapshot.freezeSettled ||
      snapshot.proofReady ||
      chamberPreview ||
      (shouldMountEngine && !engineFailed && engineReady)
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      controller.markProofReady();
    }, PROOF_READY_FALLBACK_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    chamberPreview,
    controller,
    engineReady,
    engineFailed,
    shouldMountEngine,
    snapshot.freezeSettled,
    snapshot.proofReady,
  ]);

  useEffect(() => {
    if (
      snapshot.progress < 100 ||
      snapshot.freezeSettled ||
      chamberPreview ||
      (!reducedMotion && shouldMountEngine && !engineFailed && engineReady)
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      controller.markFreezeSettled();
    }, FREEZE_FALLBACK_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    chamberPreview,
    controller,
    engineReady,
    engineFailed,
    reducedMotion,
    shouldMountEngine,
    snapshot.freezeSettled,
    snapshot.progress,
  ]);

  useEffect(() => {
    if (!rotationAllowed) {
      return;
    }

    let frameId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      controller.startRotation();

      if (!reducedMotion) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        controller.completeRotation();
      });
    }, PROOF_HOLD_MS);

    return () => {
      window.clearTimeout(timeoutId);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [controller, reducedMotion, rotationAllowed]);

  useEffect(() => {
    if (!snapshot.heroLanded || snapshot.interfaceActive || chamberPreview) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      controller.markInterfaceActive();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    chamberPreview,
    controller,
    snapshot.heroLanded,
    snapshot.interfaceActive,
  ]);

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
      data-convergence-phase={effectivePhase}
      data-proof-visible={proofVisible ? "true" : "false"}
      data-rotation-active={rotationActive ? "true" : "false"}
      data-rotation-complete={rotationComplete ? "true" : "false"}
      data-hero-landed={heroLanded ? "true" : "false"}
      data-interface-active={interfaceActive ? "true" : "false"}
      data-front-interactive={isFrontPointerActive ? "true" : "false"}
      data-back-interactive={isBackPointerActive ? "true" : "false"}
      data-view={view}
      data-engine-ready={engineReady ? "true" : undefined}
      data-vessel-debug={vesselDebugView}
    >
      <div className="cube-wrapper">
        <div className="chamber-stage">
          <div className="chamber-aperture">
            <div
              className="cube"
              onAnimationEnd={(event) => {
                if (
                  event.currentTarget !== event.target ||
                  event.animationName !== "chamber-rotate-180" ||
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
                debugView={vesselDebugView}
                proofVisible={proofVisible}
                proofSettled={snapshot.proofSettled || proofPreview}
                proofPreview={proofPreview}
                triggerVisible={
                  shouldMountEngine &&
                  !engineFailed &&
                  view === "source" &&
                  !proofVisible &&
                  chamberPreview === null
                }
                triggerDisabled={rotationActive || rotationComplete}
                onProofSettled={() => {
                  controller.markProofSettled();
                }}
                onEngineReady={(api) => {
                  engineBridgeRef.current = createConvergenceEngineBridge(api);
                  engineBridgeRef.current.sync(snapshot);
                  requestAnimationFrame(() => setEngineReady(true));
                }}
                onConvergenceFreeze={() => {
                  controller.markFreezeSettled();
                }}
                onProofReady={() => {
                  controller.markProofReady();
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

        <VesselDebugControls
          visible={showVesselDebug}
          value={vesselDebugView}
          onChange={setVesselDebugView}
        />
      </div>
    </div>
  );
}

function FrontFace({
  controller,
  interactive,
  mountEngine,
  debugView,
  proofVisible,
  proofSettled,
  proofPreview,
  triggerVisible,
  triggerDisabled,
  onProofSettled,
  onEngineReady,
  onConvergenceFreeze,
  onProofReady,
  onEngineError,
}: {
  controller: ConvergenceController;
  interactive: boolean;
  mountEngine: boolean;
  debugView: FlowEngineDebugView;
  proofVisible: boolean;
  proofSettled: boolean;
  proofPreview: boolean;
  triggerVisible: boolean;
  triggerDisabled: boolean;
  onProofSettled: () => void;
  onEngineReady: (api: FlowEngineApi) => void;
  onConvergenceFreeze: () => void;
  onProofReady: () => void;
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
              className={`flow-engine-host front-flow-host ${
                interactive ? "is-interactive" : ""
              }`}
              debugView={debugView}
              onReady={onEngineReady}
              onFrontRailMetricsChange={(metrics) => {
                latestTriggerMetricsRef.current = metrics;
                writeFrontRailAnchorStyle(triggerAnchorRef.current, metrics);

                if (!triggerAnchorReadyRef.current) {
                  triggerAnchorReadyRef.current = true;
                  setTriggerAnchorReady(true);
                }
              }}
              onConvergenceFreeze={onConvergenceFreeze}
              onProofReady={onProofReady}
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
          <ProofOverlay
            preview={proofPreview}
            settled={proofSettled}
            visible={proofVisible}
            onSettled={onProofSettled}
          />
        </div>
      </div>
    </section>
  );
}

function getFrontRailAnchorGeometry(metrics: FlowEngineFrontRailMetrics) {
  const railWidth = Math.max(metrics.width, 1);
  const railHeight = Math.max(metrics.height, 1);
  const viewportWidth =
    typeof window === "undefined" ? railWidth : window.innerWidth;
  const compactViewportBlend = 1 - smoothstepNumber(viewportWidth, 720, 1040);
  const narrowRailBlend = 1 - smoothstepNumber(railWidth, 320, 520);
  const responsiveBlend = Math.max(compactViewportBlend, narrowRailBlend);
  const unclampedHeight = railHeight * TRIGGER_BAND_FILL_RATIO;
  const moduleHeight = clampNumber(
    unclampedHeight,
    16,
    40,
  );
  const widthRatio = lerpNumber(0.18, 0.235, responsiveBlend);
  const moduleWidth = clampNumber(
    railWidth * widthRatio,
    lerpNumber(72, 56, responsiveBlend),
    lerpNumber(140, 104, responsiveBlend),
  );
  const heightOverflow = Math.max(0, moduleHeight - unclampedHeight);
  const smallRailNudge = lerpNumber(0, 1.8, responsiveBlend);
  const centerY =
    metrics.centerY
    + railHeight * lerpNumber(0.02, 0.012, responsiveBlend)
    + heightOverflow * lerpNumber(0.45, 0.56, responsiveBlend)
    + smallRailNudge;
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

function lerpNumber(start: number, end: number, t: number) {
  return start + (end - start) * clampNumber(t, 0, 1);
}

function smoothstepNumber(value: number, edge0: number, edge1: number) {
  if (edge0 === edge1) {
    return value >= edge1 ? 1 : 0;
  }

  const t = clampNumber((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
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

function ProofOverlay({
  visible,
  settled,
  preview,
  onSettled,
}: {
  visible: boolean;
  settled: boolean;
  preview: boolean;
  onSettled: () => void;
}) {
  return (
    <div
      className={`proof-front-overlay ${visible ? "is-visible" : ""} ${
        settled || preview ? "is-settled" : ""
      }`}
      onAnimationEnd={(event: ReactAnimationEvent<HTMLDivElement>) => {
        if (
          event.currentTarget !== event.target ||
          event.animationName !== "proof-front-reveal" ||
          !visible ||
          settled ||
          preview
        ) {
          return;
        }

        onSettled();
      }}
    >
      <div className="proof-front-copy">
        <h1 className="proof-front-headline">
          I BUILD
          <br />
          SUPA
          <br />
          STUFF
        </h1>
      </div>
    </div>
  );
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
      className={`cube-face cube-face-back ${interactive ? "is-interactive" : ""}`}
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

function VesselDebugControls({
  visible,
  value,
  onChange,
}: {
  visible: boolean;
  value: FlowEngineDebugView;
  onChange: (value: FlowEngineDebugView) => void;
}) {
  return (
    <div className={`vessel-debug ${visible ? "is-visible" : ""}`}>
      <button
        className={value === "composite" ? "is-active" : ""}
        type="button"
        onClick={() => onChange("composite")}
      >
        Composite
      </button>
      <button
        className={value === "geometry" ? "is-active" : ""}
        type="button"
        onClick={() => onChange("geometry")}
      >
        Geometry
      </button>
      <button
        className={value === "particles" ? "is-active" : ""}
        type="button"
        onClick={() => onChange("particles")}
      >
        Particles
      </button>
    </div>
  );
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

function getChamberPreview(value: string | null): ChamberPreview {
  if (value === "source" || value === "front") return "source";
  if (value === "proof") return "proof";
  if (value === "hero") return "back";
  if (value === "back" || value === "interface") return "back";
  return null;
}

function useChamberPreview() {
  return useSyncExternalStore(
    subscribeToLocationSearch,
    getChamberPreviewSnapshot,
    getChamberPreviewServerSnapshot,
  );
}

function subscribeToLocationSearch(onChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
  };
}

function getChamberPreviewSnapshot(): ChamberPreview {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return getChamberPreview(params.get("chamber"));
}

function getChamberPreviewServerSnapshot(): ChamberPreview {
  return null;
}

function getVesselDebugView(value: string | null): FlowEngineDebugView {
  if (value === "geometry") return "geometry";
  if (value === "particles") return "particles";
  return "composite";
}

function useVesselDebugView() {
  return useSyncExternalStore(
    subscribeToLocationSearch,
    getVesselDebugViewSnapshot,
    getVesselDebugViewServerSnapshot,
  );
}

function getVesselDebugViewSnapshot(): FlowEngineDebugView {
  if (typeof window === "undefined") return "composite";
  const params = new URLSearchParams(window.location.search);
  return getVesselDebugView(params.get("vesselDebug"));
}

function getVesselDebugViewServerSnapshot(): FlowEngineDebugView {
  return "composite";
}

function setVesselDebugView(value: FlowEngineDebugView) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (value === "composite") {
    url.searchParams.delete("vesselDebug");
  } else {
    url.searchParams.set("vesselDebug", value);
  }
  window.history.replaceState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function getRoomPhase(snapshot: ConvergenceSnapshot): RoomPhase {
  if (snapshot.rotationActive) return "rotating";
  if (snapshot.rotationComplete) return "back";
  return "source";
}
