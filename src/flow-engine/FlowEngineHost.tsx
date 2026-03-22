"use client";

import { useEffect, useRef } from "react";
import { FlowEngineBridge } from "./engineBridge";
import type { FlowEngineFrontRailMetrics, FlowEngineHostProps } from "./types";

export function FlowEngineHost({
  onReady,
  onPhaseChange,
  onConvergenceFreeze,
  onProofReady,
  onFrontRailMetricsChange,
  onError,
  className,
  debugView,
}: FlowEngineHostProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<FlowEngineBridge | null>(null);
  const pointerDownRef = useRef(false);
  const callbacksRef = useRef({
    onReady,
    onPhaseChange,
    onConvergenceFreeze,
    onProofReady,
    onFrontRailMetricsChange,
    onError,
  });

  useEffect(() => {
    callbacksRef.current = {
      onReady,
      onPhaseChange,
      onConvergenceFreeze,
      onProofReady,
      onFrontRailMetricsChange,
      onError,
    };
  }, [
    onReady,
    onPhaseChange,
    onConvergenceFreeze,
    onProofReady,
    onFrontRailMetricsChange,
    onError,
  ]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const bridge = new FlowEngineBridge(host, {
      onPhaseChange: (phase) => {
        callbacksRef.current.onPhaseChange?.(phase);
      },
      onConvergenceFreeze: () => {
        callbacksRef.current.onConvergenceFreeze?.();
      },
      onProofReady: () => {
        callbacksRef.current.onProofReady?.();
      },
      onFrontRailMetricsChange: (metrics: FlowEngineFrontRailMetrics) => {
        callbacksRef.current.onFrontRailMetricsChange?.(metrics);
      },
      onError: (error) => {
        callbacksRef.current.onError?.(error);
      },
      debugView,
    });
    bridgeRef.current = bridge;

    let cancelled = false;
    bridge
      .init()
      .then(() => {
        if (!cancelled) {
          callbacksRef.current.onReady?.(bridge);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          callbacksRef.current.onError?.(error);
        }
      });

    return () => {
      cancelled = true;
      bridge.dispose();
      if (bridgeRef.current === bridge) {
        bridgeRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    bridgeRef.current?.setDebugView(debugView ?? "composite");
  }, [debugView]);

  useEffect(() => {
    return () => {
      pointerDownRef.current = false;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={className}
      onPointerDown={(event) => {
        pointerDownRef.current = true;
        bridgeRef.current?.setPointer(event.clientX, event.clientY, true);
      }}
      onPointerUp={(event) => {
        pointerDownRef.current = false;
        bridgeRef.current?.setPointer(event.clientX, event.clientY, false);
      }}
      onPointerMove={(event) => {
        bridgeRef.current?.setPointer(
          event.clientX,
          event.clientY,
          pointerDownRef.current,
        );
      }}
      onPointerLeave={(event) => {
        pointerDownRef.current = false;
        bridgeRef.current?.clearPointer(event.clientX, event.clientY);
      }}
    />
  );
}
