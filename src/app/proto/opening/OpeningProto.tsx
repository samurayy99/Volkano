"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlowEngineBridge } from "../../../flow-engine/engineBridge";
import { copy } from "../../studio/content";
import styles from "./OpeningProto.module.css";

/**
 * P1 — THE OPENING
 *
 * LEGACY ENGINEERING PROOF · VISUALLY REJECTED 2026-07-25 · DO NOT EXTEND
 *
 * Kept as evidence, not as a starting point. It proved the transition is technically
 * affordable (worst frame 9.3 ms at 120 fps, reverse scrub clean) and failed its
 * visual gate: the world shrinks to a picture-in-picture card instead of opening,
 * LENOX is scaled by the same formula instead of crossing a boundary, and everything
 * rides one interpolation instead of distinct beats.
 *
 * It also predates the direction change — it drives an authored character through the
 * old wake sequence, which the phase-field direction retires entirely.
 *
 * The successor is a NEW route, `/proto/phase-field`, built material-first. Reusing
 * these CSS transforms and swapping the image for particles would reproduce the same
 * rejected transition in a new colour.
 */

const CLIP = "/flow-assets/gravity-clip-a-v2-dense.mp4";

type Probe = {
  fps: number;
  worstMs: number;
  particles: number;
  gpu: "probing" | "webgpu" | "fallback";
};

export function OpeningProto() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const runwayRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<FlowEngineBridge | null>(null);
  const progressRef = useRef(0);
  /** Worst frame is only meaningful while the opening is actually moving. */
  const inTransitionRef = useRef(false);
  const [reduced, setReduced] = useState(false);
  const [probe, setProbe] = useState<Probe>({
    fps: 0,
    worstMs: 0,
    particles: 0,
    gpu: "probing",
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduced(media.matches);
    read();
    media.addEventListener("change", read);
    return () => media.removeEventListener("change", read);
  }, []);

  /** One property per frame, written straight to the root — no React state in the loop. */
  const applyProgress = useCallback((value: number) => {
    const root = rootRef.current;
    if (!root) return;
    progressRef.current = value;
    root.style.setProperty("--p", value.toFixed(4));
  }, []);

  useEffect(() => {
    if (!reduced) return;
    applyProgress(1);
  }, [applyProgress, reduced]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const runway = runwayRef.current;
    if (!scroller || !runway || reduced) return;

    let queued = false;
    const read = () => {
      queued = false;
      const travel = Math.max(runway.offsetHeight - scroller.clientHeight, 1);
      const next = Math.min(1, Math.max(0, scroller.scrollTop / travel));
      inTransitionRef.current = next > 0.02 && next < 0.98;
      applyProgress(next);
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(read);
    };

    read();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", read);
    };
  }, [applyProgress, reduced]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !navigator.gpu) {
      const timer = window.setTimeout(() => setProbe((p) => ({ ...p, gpu: "fallback" })), 0);
      return () => window.clearTimeout(timer);
    }
    const bridge = new FlowEngineBridge(host, {
      lenoxMode: true,
      lenoxReducedMotion: reduced,
      // Each reality owns its background; the canvas is particles + LENOX on transparency.
      lenoxBackdrop: false,
      onError: (error) => console.error("[p1] engine error", error),
      onDeviceLost: () => setProbe((p) => ({ ...p, gpu: "fallback" })),
    });
    bridgeRef.current = bridge;
    let cancelled = false;
    bridge
      .init()
      .then(() => {
        if (cancelled) return;
        setProbe((p) => ({ ...p, gpu: "webgpu" }));
        // LENOX is present before the opening starts and must survive it.
        bridge.setLenoxState("waking");
      })
      .catch((error) => {
        console.warn("[p1] WebGPU unavailable", error);
        if (!cancelled) setProbe((p) => ({ ...p, gpu: "fallback" }));
      });
    return () => {
      cancelled = true;
      bridge.dispose();
      if (bridgeRef.current === bridge) bridgeRef.current = null;
    };
  }, [reduced]);

  /** Frame probe: this is the evidence the gate is judged on, so it must never lie. */
  useEffect(() => {
    let raf = 0;
    let stopped = false;
    let last = 0;
    let acc = 0;
    let frames = 0;
    let worst = 0;
    const tick = (now: number) => {
      if (stopped) return;
      // First callback only establishes the baseline — no delta exists yet.
      if (last === 0) {
        last = now;
        raf = window.requestAnimationFrame(tick);
        return;
      }
      const dt = now - last;
      last = now;
      if (Number.isFinite(dt) && dt > 0) {
        acc += dt;
        frames += 1;
        if (inTransitionRef.current && dt > worst) worst = dt;
      }
      if (acc >= 500 && frames > 0) {
        const perf = (window as unknown as { __LENOX_PERF__?: { particles: number } })
          .__LENOX_PERF__;
        const fps = Math.round((frames * 1000) / acc);
        setProbe((p) => ({
          ...p,
          fps,
          worstMs: Math.round(worst * 10) / 10,
          particles: perf?.particles ?? 0,
        }));
        acc = 0;
        frames = 0;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
    };
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    bridgeRef.current?.setPointer(event.clientX, event.clientY, false);
  }, []);

  return (
    <div className={styles.root} ref={rootRef} onPointerMove={onPointerMove}>
      <div className={styles.world}>
        <video
          className={styles.worldMedia}
          src={CLIP}
          poster="/studio/world/hero-keyframe.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
        />
      </div>

      <div className={styles.lenoxLayer}>
        <div ref={hostRef} className={styles.engineHost} />
      </div>

      <div className={styles.scroller} ref={scrollerRef}>
        {/* The runway is the opening. The page is revealed inside it, not after it. */}
        <div className={styles.runway} ref={runwayRef}>
          <div className={styles.stage}>
            <div className={styles.pageIntro}>
              <h1>
                {copy.hero.title.en.split("\n").map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </h1>
              <p>{copy.hero.body.en.replace("\n", " ")}</p>
            </div>
          </div>
        </div>
        <main className={styles.page}>
          <div className={styles.filler}>
            <div>PAGE CONTINUES · PLACEHOLDER 01</div>
            <div>PAGE CONTINUES · PLACEHOLDER 02</div>
            <div>PAGE CONTINUES · PLACEHOLDER 03</div>
          </div>
        </main>
      </div>

      <div className={styles.hud} data-warn={probe.worstMs > 34}>
        <span>P1 · OPENING PROTOTYPE</span>
        <span>FPS <b>{probe.fps}</b></span>
        <span>WORST FRAME IN TRANSITION <b>{probe.worstMs} ms</b></span>
        <span>ENGINE <b>{probe.gpu}</b> · {probe.particles} PARTICLES</span>
        <span>REDUCED MOTION <b>{reduced ? "ON" : "OFF"}</b></span>
      </div>
    </div>
  );
}
