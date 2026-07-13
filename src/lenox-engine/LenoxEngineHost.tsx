'use client';

import { useEffect, useRef, useCallback } from 'react';
import { ParticleSystem } from './particleSystem';
import type { LenoxEngineApi, LenoxVisualState, LenoxEngineCallbacks } from './types';

interface Props extends LenoxEngineCallbacks {
  className?: string;
}

export function LenoxEngineHost({
  onReady,
  onError,
  onWakeComplete,
  onAwake,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const systemRef = useRef<ParticleSystem | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;

    try {
      const sys = new ParticleSystem(container);
      systemRef.current = sys;

      // Wire callbacks
      sys.onWakeComplete = () => {
        if (!disposed) onWakeComplete?.();
      };
      sys.onAwake = () => {
        if (!disposed) onAwake?.();
      };

      const api: LenoxEngineApi = {
        setState: (s: LenoxVisualState) => sys.setState(s),
        setEnergy: (l: number) => sys.setEnergy(l),
        setCursor: (x: number, y: number) => sys.setCursor(x, y),
        dispose: () => sys.dispose(),
      };

      onReady?.(api);
    } catch (err) {
      if (!disposed) onError?.(err);
    }

    return () => {
      disposed = true;
      systemRef.current?.dispose();
      systemRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    systemRef.current?.setCursor(
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height,
    );
  }, []);

  const handlePointerLeave = useCallback(() => {
    systemRef.current?.setCursor(0.5, 0.5);
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
    />
  );
}
