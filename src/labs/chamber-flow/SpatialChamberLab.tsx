'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import FlowLabHost from './FlowLabHost';

export function SpatialChamberLab() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const handleReady = useCallback(() => setEngineReady(true), []);

  // Pointer parallax — writes --mouse-x / --mouse-y to site-root.
  // Active only during source phase; frozen during rotation and back.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const handler = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5);
      const ny = (e.clientY / window.innerHeight - 0.5);
      el.style.setProperty('--mouse-x', nx.toFixed(3));
      el.style.setProperty('--mouse-y', ny.toFixed(3));
    };

    el.addEventListener('pointermove', handler, { passive: true });
    return () => el.removeEventListener('pointermove', handler);
  }, []);

  return (
    <div
      className="site-root"
      ref={rootRef}
      data-phase="source"
      data-flow-mode="idle"
      data-front-interactive="true"
      data-back-interactive="false"
      data-view="source"
      data-engine-ready={engineReady ? 'true' : undefined}
    >
      <div className="cube-wrapper">
        <div className="chamber-stage">
          <div className="chamber-aperture">
            <div className="cube">
              <FrontFaceLab onReady={handleReady} />

              <ProofFaceLab />
              <BackFaceLab />
              
              <WallFace className="cube-face cube-face-left" />
              <WallFace className="cube-face cube-face-top" />
              <WallFace className="cube-face cube-face-bottom" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FrontFaceLab({ onReady }: { onReady?: () => void }) {
  return (
    <section className="cube-face cube-face-front" aria-label="Source chamber">
      <div className="front-source">
        <div className="front-source-host">
          <FlowLabHost onReady={onReady} />
        </div>
      </div>
    </section>
  );
}

function ProofFaceLab() {
  return (
    <section className="cube-face cube-face-right" aria-label="Proof moment">
      <div className="proof-surface">
        <h1 className="proof-headline" style={{ opacity: 1, transform: 'translateY(0)' }}>
          I BUILD<br />
          SUPA<br />
          STUFF
        </h1>
      </div>
    </section>
  );
}

function BackFaceLab() {
  return (
    <section
      className="cube-face cube-face-back"
      aria-label="Hero wall"
    >
      <div className="back-surface">
        <div className="back-scene-media" aria-hidden="true" />
        <div className="back-scene-haze" aria-hidden="true" />

        <header className="back-chrome">
          <span className="back-brand">VOLKANO LAB</span>
        </header>

        <div className="back-scroll">
          <section className="back-hero">
            <h2>Lab Integration</h2>
          </section>
        </div>
      </div>
    </section>
  );
}

function WallFace({ className }: { className: string }) {
  return <div className={className} aria-hidden="true" />;
}
