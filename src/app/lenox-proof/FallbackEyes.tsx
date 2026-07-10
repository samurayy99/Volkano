"use client";

import { useEffect, useRef } from "react";
import type { LenoxProofState } from "../../flow-engine/types";

const N = 900;

/**
 * Minimal Canvas2D fallback for devices without WebGPU. Deliberately simple
 * (placeholder quality): drifting dust that converges into two eye fields
 * with gaze follow. Honest fallback, not the product visual.
 */
export function FallbackEyes({ state }: { state: LenoxProofState }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let gazeX = 0;
    let gazeY = 0;
    let targetGazeX = 0;
    let targetGazeY = 0;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (event: PointerEvent) => {
      targetGazeX = event.clientX / window.innerWidth - 0.5;
      targetGazeY = event.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("pointermove", onMove);

    const hash = (i: number, s: number) => {
      const x = Math.sin((i + 1) * s) * 43758.5453;
      return x - Math.floor(x);
    };
    const particles = Array.from({ length: N }, (_, i) => ({
      x: hash(i, 12.9898),
      y: hash(i, 78.233),
      seed: hash(i, 39.346),
    }));

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#050607";
      ctx.fillRect(0, 0, w, h);

      gazeX += (targetGazeX - gazeX) * 0.08;
      gazeY += (targetGazeY - gazeY) * 0.08;

      const eyes = stateRef.current === "alive" || stateRef.current === "waking";
      const gatherT = stateRef.current === "waking" ? 0.55 : 1;

      for (let i = 0; i < N; i++) {
        const p = particles[i];
        const drift = t * 0.00004 * (0.5 + p.seed);
        const dx = Math.sin(drift * 7 + i) * 0.004;
        const dy = Math.cos(drift * 9 + i * 1.7) * 0.004;

        let tx = p.x + dx;
        let ty = p.y + dy;
        if (eyes) {
          const left = i % 2 === 0;
          const cx = (left ? 0.38 : 0.62) + gazeX * 0.03;
          const cy = 0.42 + gazeY * 0.02;
          const ang = p.seed * Math.PI * 2 + t * 0.0002;
          const r = Math.sqrt(p.seed) * gatherT;
          tx = cx + Math.cos(ang) * r * 0.055;
          ty = cy + Math.sin(ang) * r * 0.035;
        }
        p.x += (tx - p.x) * (eyes ? 0.05 : 0.02);
        p.y += (ty - p.y) * (eyes ? 0.05 : 0.02);

        const px = p.x * w;
        const py = p.y * h;
        const cyan = 0.4 + p.seed * 0.6;
        ctx.fillStyle = `rgba(${Math.round(90 + 80 * cyan)}, ${Math.round(
          190 + 50 * cyan,
        )}, 255, ${eyes ? 0.55 : 0.3})`;
        ctx.fillRect(px, py, 2 * dpr, 2 * dpr);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
