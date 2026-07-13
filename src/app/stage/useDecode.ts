"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Type does not fade in on this site. It DECODES — noise resolving into language,
 * left to right, while the tail keeps churning. It is the same arrival the whole
 * page will use later when Lenox builds it, so the HUD has to speak it first:
 * everything here arrives the way the page itself was made.
 *
 * Thirty lines instead of a plugin. GSAP's ScrambleText does exactly this, and we
 * will want GSAP when the build choreography needs a real timeline — but pulling
 * an animation library in to churn twelve characters would be the wrong trade.
 */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/·—";

export function useDecode(
  text: string,
  active: boolean,
  durationMs = 700,
  delayMs = 0,
) {
  const [shown, setShown] = useState("");
  const frame = useRef(0);

  useEffect(() => {
    if (!active) {
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || text.length === 0) {
      frame.current = requestAnimationFrame(() => setShown(text));
      return () => cancelAnimationFrame(frame.current);
    }

    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      if (now < start) {
        frame.current = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - start) / durationMs);
      // The reveal front runs slightly ahead of linear so the last glyphs land
      // together rather than trickling — a decode that dribbles reads as a bug.
      const settled = Math.floor(text.length * t * t);

      let out = "";
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === " " || i < settled) out += ch;
        else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      setShown(out);

      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setShown(text);
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [text, active, durationMs, delayMs]);

  return active ? shown : "";
}
