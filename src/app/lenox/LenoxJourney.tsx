"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlowEngineBridge } from "../../flow-engine/engineBridge";
import type { LenoxProofState } from "../../flow-engine/types";
import { FallbackEyes } from "../lenox-proof/FallbackEyes";
import styles from "./LenoxJourney.module.css";

/** WAKE arms after this long in engaged… */
const ARM_AFTER_SEC = 3.0;
/** …or earlier after a clear interaction followed by a short rest. */
const ARM_MIN_TRAVEL_PX = 140;
const ARM_REST_SEC = 1.2;

type JourneyPhase = "void" | "play" | "armed" | "awakening" | "present";

const STATUS_TEXT: Record<JourneyPhase, string> = {
  void: "A dark, quiet field of signal dust.",
  play: "The dust reacts gently around your pointer.",
  armed: "Lenox can be woken now.",
  awakening: "The dust is gathering into a living entity.",
  present: "Lenox is awake and looking at you.",
};

/**
 * Canonical Lenox journey on the same runtime as /lenox-proof (no second
 * character engine). Site shell reuses existing project content only:
 * wordmark, and the SpatialChamber sections (Services / Evidence / Contact /
 * Book a Call). Menu entries without dedicated pages are shell placeholders
 * (no invented pages, no new copy).
 */
export function LenoxJourney() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<FlowEngineBridge | null>(null);
  const phaseRef = useRef<JourneyPhase>("void");
  const travelRef = useRef(0);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const armTimerRef = useRef<number | null>(null);
  const restTimerRef = useRef<number | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuFirstItemRef = useRef<HTMLAnchorElement | null>(null);

  const [phase, setPhase] = useState<JourneyPhase>("void");
  const [gpuPath, setGpuPath] = useState<"webgpu" | "fallback" | "probing">("probing");
  const [menuOpen, setMenuOpen] = useState(false);

  const goPhase = useCallback((next: JourneyPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // Engine boot. Reduced motion is read once at boot (a live preference
  // change applies on the next visit).
  useEffect(() => {
    if (!navigator.gpu) {
      const t = window.setTimeout(() => setGpuPath("fallback"), 0);
      return () => window.clearTimeout(t);
    }
    const host = hostRef.current;
    if (!host) return;

    const bridge = new FlowEngineBridge(host, {
      lenoxMode: true,
      lenoxReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
      onLenoxStateChange: (state: LenoxProofState) => {
        if (state === "present" && phaseRef.current === "awakening") {
          goPhase("present");
        }
      },
      onError: (error) => console.error("[lenox] engine error", error),
    });
    bridgeRef.current = bridge;

    let cancelled = false;
    bridge
      .init()
      .then(() => {
        if (!cancelled) setGpuPath("webgpu");
      })
      .catch((error) => {
        console.warn("[lenox] WebGPU init failed → fallback", error);
        if (!cancelled) {
          bridge.dispose();
          bridgeRef.current = null;
          setGpuPath("fallback");
        }
      });

    return () => {
      cancelled = true;
      bridge.dispose();
      if (bridgeRef.current === bridge) bridgeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
      if (restTimerRef.current !== null) window.clearTimeout(restTimerRef.current);
    },
    [],
  );

  const arm = useCallback(() => {
    if (phaseRef.current !== "play") return;
    bridgeRef.current?.setLenoxState("armed");
    goPhase("armed");
  }, [goPhase]);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const bridge = bridgeRef.current;
      bridge?.setPointer(event.clientX, event.clientY, false);
      bridge?.setLenoxGaze(
        event.clientX / window.innerWidth - 0.5,
        0.5 - event.clientY / window.innerHeight,
      );

      const phaseNow = phaseRef.current;
      if (phaseNow === "void") {
        bridge?.setLenoxState("engaged");
        goPhase("play");
        armTimerRef.current = window.setTimeout(arm, ARM_AFTER_SEC * 1000);
        lastPointRef.current = { x: event.clientX, y: event.clientY };
        return;
      }
      if (phaseNow === "play") {
        const last = lastPointRef.current;
        if (last) {
          travelRef.current += Math.hypot(
            event.clientX - last.x,
            event.clientY - last.y,
          );
        }
        lastPointRef.current = { x: event.clientX, y: event.clientY };
        // Clear interaction + short rest also arms (no frantic stirring
        // required, no big travel threshold).
        if (restTimerRef.current !== null) window.clearTimeout(restTimerRef.current);
        if (travelRef.current >= ARM_MIN_TRAVEL_PX) {
          restTimerRef.current = window.setTimeout(arm, ARM_REST_SEC * 1000);
        }
      }
    },
    [arm, goPhase],
  );

  const onWake = useCallback(() => {
    if (phaseRef.current !== "armed") return;
    bridgeRef.current?.setLenoxState("awakening");
    goPhase("awakening");
  }, [goPhase]);

  // Menu a11y: Escape closes, focus moves in/out.
  const openMenu = useCallback(() => {
    setMenuOpen(true);
    window.setTimeout(() => menuFirstItemRef.current?.focus(), 0);
  }, []);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    window.setTimeout(() => menuButtonRef.current?.focus(), 0);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, closeMenu]);

  return (
    <>
      <div
        className={styles.stage}
        onPointerMove={onPointerMove}
        onPointerLeave={() => bridgeRef.current?.setLenoxGaze(0, 0)}
        // Background leaves the interaction while the menu is open.
        inert={menuOpen ? true : undefined}
      >
        {gpuPath === "fallback" ? (
          <>
            <FallbackEyes state={phase === "present" ? "alive" : "waking"} />
            <p className={styles.fallbackNote}>
              LENOX RUNS BEST WITH WEBGPU — SHOWING A SIMPLE PREVIEW
            </p>
          </>
        ) : (
          <div
            ref={hostRef}
            className={styles.canvasHost}
            role="img"
            aria-label={STATUS_TEXT[phase]}
          />
        )}

        {phase === "play" ? (
          <p className={styles.prompt} aria-hidden="true">
            PLAY WITH ME
          </p>
        ) : null}

        {phase === "armed" ? (
          <button type="button" className={styles.wake} onClick={onWake}>
            Wake Lenox
          </button>
        ) : null}

        <p className={styles.srOnly} role="status" aria-live="polite">
          {STATUS_TEXT[phase]}
        </p>
      </div>

      {/* Site shell (existing project content only). */}
      <header className={styles.shellBar}>
        <span className={styles.brand}>VOLKAN AI STUDIO</span>
        <button
          ref={menuButtonRef}
          type="button"
          className={styles.menuButton}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          onClick={menuOpen ? closeMenu : openMenu}
        >
          Menu
        </button>
      </header>

      {menuOpen ? (
        <nav
          className={styles.menuOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
        >
          {/* Shell placeholders: sections exist as project content
              (SpatialChamber back wall) but have no dedicated pages yet. */}
          <a
            ref={menuFirstItemRef}
            className={styles.menuItem}
            href="#services"
            onClick={closeMenu}
          >
            Services
          </a>
          <a className={styles.menuItem} href="#evidence" onClick={closeMenu}>
            Evidence
          </a>
          <a
            className={styles.menuItem}
            href="mailto:hello@volkano.dev"
            onClick={closeMenu}
          >
            Contact
          </a>
          <a
            className={styles.menuItem}
            href="mailto:hello@volkano.dev?subject=Book%20a%20Call"
            onClick={closeMenu}
          >
            Book a Call
          </a>
          <button
            type="button"
            className={styles.menuClose}
            onClick={closeMenu}
          >
            Close
          </button>
        </nav>
      ) : null}
    </>
  );
}
