"use client";

import { useEffect, useRef } from "react";
import { FlowEngineBridge } from "./engineBridge";
import type { FlowEngineFrontRailMetrics, FlowEngineHostProps } from "./types";

export function FlowEngineHost({
  onReady,
  onRotationReady,
  onFrontRailMetricsChange,
  onError,
  className,
}: FlowEngineHostProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<FlowEngineBridge | null>(null);
  const pointerDownRef = useRef(false);
  const capturedPointerIdRef = useRef<number | null>(null);
  const callbacksRef = useRef({
    onReady,
    onRotationReady,
    onFrontRailMetricsChange,
    onError,
  });

  useEffect(() => {
    callbacksRef.current = {
      onReady,
      onRotationReady,
      onFrontRailMetricsChange,
      onError,
    };
  }, [
    onReady,
    onRotationReady,
    onFrontRailMetricsChange,
    onError,
  ]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const bridge = new FlowEngineBridge(host, {
      onRotationReady: () => {
        callbacksRef.current.onRotationReady?.();
      },
      onFrontRailMetricsChange: (metrics: FlowEngineFrontRailMetrics) => {
        callbacksRef.current.onFrontRailMetricsChange?.(metrics);
      },
      onError: (error) => {
        callbacksRef.current.onError?.(error);
      },
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
          bridge.dispose();
          if (bridgeRef.current === bridge) {
            bridgeRef.current = null;
          }
        }
      });

    return () => {
      cancelled = true;
      pointerDownRef.current = false;
      const el = hostRef.current;
      const pid = capturedPointerIdRef.current;
      if (el != null && pid != null) {
        try {
          if (el.hasPointerCapture(pid)) {
            el.releasePointerCapture(pid);
          }
        } catch {
          /* ignore */
        }
      }
      capturedPointerIdRef.current = null;
      bridge.dispose();
      if (bridgeRef.current === bridge) {
        bridgeRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={className}
      onPointerDown={(event) => {
        if (
          pointerDownRef.current &&
          capturedPointerIdRef.current != null &&
          capturedPointerIdRef.current !== event.pointerId
        ) {
          return;
        }
        pointerDownRef.current = true;
        capturedPointerIdRef.current = event.pointerId;
        bridgeRef.current?.setPointer(event.clientX, event.clientY, true);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* unsupported or passive */
        }
      }}
      onPointerUp={(event) => {
        if (capturedPointerIdRef.current !== event.pointerId) {
          return;
        }
        try {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        } catch {
          /* ignore */
        }
        capturedPointerIdRef.current = null;
        pointerDownRef.current = false;
        bridgeRef.current?.setPointer(event.clientX, event.clientY, false);
      }}
      onPointerCancel={(event) => {
        if (capturedPointerIdRef.current !== event.pointerId) {
          return;
        }
        try {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        } catch {
          /* ignore */
        }
        capturedPointerIdRef.current = null;
        pointerDownRef.current = false;
        bridgeRef.current?.clearPointer();
      }}
      onLostPointerCapture={() => {
        capturedPointerIdRef.current = null;
        pointerDownRef.current = false;
        bridgeRef.current?.clearPointer();
      }}
      onPointerMove={(event) => {
        if (
          pointerDownRef.current &&
          capturedPointerIdRef.current != null &&
          event.pointerId !== capturedPointerIdRef.current
        ) {
          return;
        }
        bridgeRef.current?.setPointer(
          event.clientX,
          event.clientY,
          pointerDownRef.current,
        );
      }}
      onPointerLeave={() => {
        if (pointerDownRef.current) return;
        bridgeRef.current?.clearPointer();
      }}
    />
  );
}
