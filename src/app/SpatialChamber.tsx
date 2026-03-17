'use client';

import {
  type RefObject,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { FlowEngineHost } from '../flow-engine';
import {
  isFlowSequenceFinished,
  resolveFlowMode,
  type FlowMode,
} from '../flow-engine/sequenceTimeline';
import type { FlowEngineApi, FlowEngineDebugView } from '../flow-engine/types';

type RoomPhase = 'source' | 'rotating' | 'back';
type ChamberPreview = 'source' | 'proof' | 'back' | null;

export function SpatialChamber() {
  const reducedMotion = useReducedMotionPreference();
  const chamberPreview = useChamberPreview();
  const vesselDebugView = useVesselDebugView();
  const backScrollRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const engineApiRef = useRef<FlowEngineApi | null>(null);
  const sequenceStartMsRef = useRef<number | null>(null);
  const sequenceFrameRef = useRef<number | null>(null);
  const [flowMode, setFlowMode] = useState<FlowMode>('idle');
  const [engineFailed, setEngineFailed] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [isSequenceRunning, setIsSequenceRunning] = useState(false);

  const phase = getRoomPhase(flowMode);
  const view: RoomPhase | 'proof' = chamberPreview ?? (reducedMotion ? 'back' : phase);
  const isFrontPointerActive = !reducedMotion && view === 'source' && flowMode === 'idle';
  const isBackPointerActive = view === 'back';
  const shouldMountEngine =
    chamberPreview === null ? !reducedMotion && !engineFailed : chamberPreview === 'source' && !engineFailed;
  const showVesselDebug =
    process.env.NODE_ENV !== 'production' && view === 'source' && flowMode === 'idle';

  useEffect(() => {
    const engine = engineApiRef.current;
    if (!engine) return;
    engine.setMode(flowMode);
    engine.setInteractiveEnabled(isFrontPointerActive);
  }, [flowMode, isFrontPointerActive]);

  const handleEnter = useCallback(() => {
    if (chamberPreview) return;
    if (reducedMotion) return;
    if (flowMode !== 'idle') return;

    startTransition(() => {
      sequenceStartMsRef.current = performance.now();
      setIsSequenceRunning(true);
      setFlowMode('enter_burst');
    });
  }, [chamberPreview, flowMode, reducedMotion]);

  useEffect(() => {
    if (!isSequenceRunning || chamberPreview || reducedMotion) {
      return;
    }

    let cancelled = false;

    const step = () => {
      if (cancelled) return;

      const startMs = sequenceStartMsRef.current;
      if (startMs == null) {
        setIsSequenceRunning(false);
        return;
      }

      const elapsedSeconds = (performance.now() - startMs) / 1000;
      const nextMode = resolveFlowMode(elapsedSeconds);
      setFlowMode((current) => (current === nextMode ? current : nextMode));

      if (isFlowSequenceFinished(elapsedSeconds)) {
        setIsSequenceRunning(false);
        sequenceFrameRef.current = null;
        return;
      }

      sequenceFrameRef.current = window.requestAnimationFrame(step);
    };

    sequenceFrameRef.current = window.requestAnimationFrame(step);

    return () => {
      cancelled = true;
      if (sequenceFrameRef.current != null) {
        window.cancelAnimationFrame(sequenceFrameRef.current);
        sequenceFrameRef.current = null;
      }
    };
  }, [isSequenceRunning, chamberPreview, reducedMotion]);

  useEffect(() => {
    const scrollNode = backScrollRef.current;
    if (!scrollNode) return;

    const frameId = window.requestAnimationFrame(() => {
      scrollNode.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [chamberPreview, reducedMotion, view]);

  // Pointer parallax — writes --mouse-x / --mouse-y to site-root.
  // Active only during source phase; frozen during rotation and back.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || reducedMotion) return;

    const handler = (e: PointerEvent) => {
      if (flowMode !== 'idle' || view !== 'source') return;
      const nx = (e.clientX / window.innerWidth - 0.5);
      const ny = (e.clientY / window.innerHeight - 0.5);
      el.style.setProperty('--mouse-x', nx.toFixed(3));
      el.style.setProperty('--mouse-y', ny.toFixed(3));
    };

    el.addEventListener('pointermove', handler, { passive: true });
    return () => el.removeEventListener('pointermove', handler);
  }, [flowMode, reducedMotion, view]);

  return (
    <div
      className="site-root"
      ref={rootRef}
      data-phase={phase}
      data-flow-mode={flowMode}
      data-front-interactive={isFrontPointerActive ? 'true' : 'false'}
      data-back-interactive={isBackPointerActive ? 'true' : 'false'}
      data-view={view}
      data-engine-ready={engineReady ? 'true' : undefined}
      data-vessel-debug={vesselDebugView}
    >
      <div className="cube-wrapper">
        <div className="chamber-stage">
          <div className="chamber-aperture">
            <div className="cube">
              <FrontFace
                interactive={isFrontPointerActive}
                mountEngine={shouldMountEngine && !engineFailed}
                debugView={vesselDebugView}
                onEngineReady={(api) => {
                  engineApiRef.current = api;
                  api.setMode(flowMode);
                  api.setInteractiveEnabled(isFrontPointerActive);
                  requestAnimationFrame(() => setEngineReady(true));
                }}
                onEngineError={() => {
                  setEngineFailed(true);
                }}
              />

              <ProofFace />
              <BackFace interactive={isBackPointerActive} scrollRef={backScrollRef} />
              <WallFace className="cube-face cube-face-left" />
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
        <EnterButton visible={view === 'source' && flowMode === 'idle'} onEnter={handleEnter} />
      </div>
    </div>
  );
}

function FrontFace({
  interactive,
  mountEngine,
  debugView,
  onEngineReady,
  onEngineError,
}: {
  interactive: boolean;
  mountEngine: boolean;
  debugView: FlowEngineDebugView;
  onEngineReady: (api: FlowEngineApi) => void;
  onEngineError: (error: unknown) => void;
}) {
  return (
    <section className="cube-face cube-face-front" aria-label="Source chamber">
      <div className="front-source">
        <div className="front-source-host">
          {mountEngine ? (
            <FlowEngineHost
              className={`flow-engine-host front-flow-host ${
                interactive ? 'is-interactive' : ''
              }`}
              debugView={debugView}
              onReady={onEngineReady}
              onError={onEngineError}
            />
          ) : (
            <div className="front-engine-fallback" aria-hidden="true" />
          )}
        </div>
      </div>
    </section>
  );
}

function ProofFace() {
  return (
    <section className="cube-face cube-face-right" aria-label="Proof moment">
      <div className="proof-surface">
        <h1 className="proof-headline">
          I BUILD<br />
          SUPA<br />
          STUFF
        </h1>
      </div>
    </section>
  );
}

function BackFace({
  interactive,
  scrollRef,
}: {
  interactive: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <section
      className={`cube-face cube-face-back ${interactive ? 'is-interactive' : ''}`}
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

function EnterButton({
  visible,
  onEnter,
}: {
  visible: boolean;
  onEnter: () => void;
}) {
  return (
    <div className={`enter-overlay ${visible ? 'is-visible' : ''}`}>
      <button
        className="enter-button"
        type="button"
        onClick={onEnter}
        disabled={!visible}
      >
        ENTER
      </button>
    </div>
  );
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
    <div className={`vessel-debug ${visible ? 'is-visible' : ''}`}>
      <button
        className={value === 'composite' ? 'is-active' : ''}
        type="button"
        onClick={() => onChange('composite')}
      >
        Composite
      </button>
      <button
        className={value === 'geometry' ? 'is-active' : ''}
        type="button"
        onClick={() => onChange('geometry')}
      >
        Geometry
      </button>
      <button
        className={value === 'particles' ? 'is-active' : ''}
        type="button"
        onClick={() => onChange('particles')}
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
  if (typeof window === 'undefined') {
    return () => {};
  }

  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', onChange);

  return () => {
    query.removeEventListener('change', onChange);
  };
}

function getReducedMotionSnapshot() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

function getChamberPreview(value: string | null): ChamberPreview {
  if (value === 'source' || value === 'front') return 'source';
  if (value === 'proof') return 'proof';
  if (value === 'hero') return 'back';
  if (value === 'back' || value === 'interface') return 'back';
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
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
  };
}

function getChamberPreviewSnapshot(): ChamberPreview {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return getChamberPreview(params.get('chamber'));
}

function getChamberPreviewServerSnapshot(): ChamberPreview {
  return null;
}

function getVesselDebugView(value: string | null): FlowEngineDebugView {
  if (value === 'geometry') return 'geometry';
  if (value === 'particles') return 'particles';
  return 'composite';
}

function useVesselDebugView() {
  return useSyncExternalStore(
    subscribeToLocationSearch,
    getVesselDebugViewSnapshot,
    getVesselDebugViewServerSnapshot,
  );
}

function getVesselDebugViewSnapshot(): FlowEngineDebugView {
  if (typeof window === 'undefined') return 'composite';
  const params = new URLSearchParams(window.location.search);
  return getVesselDebugView(params.get('vesselDebug'));
}

function getVesselDebugViewServerSnapshot(): FlowEngineDebugView {
  return 'composite';
}

function setVesselDebugView(value: FlowEngineDebugView) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (value === 'composite') {
    url.searchParams.delete('vesselDebug');
  } else {
    url.searchParams.set('vesselDebug', value);
  }
  window.history.replaceState({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function getRoomPhase(flowMode: FlowMode): RoomPhase {
  if (flowMode === 'clear_and_rotate') return 'rotating';
  if (flowMode === 'ui_settle') return 'back';
  return 'source';
}
