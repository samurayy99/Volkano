"use client";

import { useEffect, useRef } from "react";
import { FlowLabBridge } from "./flowLabBridge";

export default function FlowLabHost({ onReady }: { onReady?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<FlowLabBridge | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Bridge
    const bridge = new FlowLabBridge();
    bridgeRef.current = bridge;

    // Mount returns after init + first rAF is queued.
    // Signal ready after one more frame to ensure first render completed.
    bridge.mount(containerRef.current).then(() => {
      requestAnimationFrame(() => onReadyRef.current?.());
    });

    // Resize Observer for responsive fluid sizing
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === containerRef.current) {
          bridge.resize(entry.contentRect.width, entry.contentRect.height);
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      if (bridgeRef.current) {
        bridgeRef.current.destroy();
        bridgeRef.current = null;
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="flow-engine-host front-flow-host"
    />
  );
}
