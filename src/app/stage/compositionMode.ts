"use client";

import { useEffect, useState } from "react";

/**
 * How the stage is composed — and there are only ever two ways.
 *
 *   side   — Lenox steps ASIDE. He owns the left third, the page fills the rest.
 *   banded — Lenox steps UP. He owns a band at the top, the page is built beneath.
 *
 * Same gesture: he makes room. Different axis.
 *
 * This is the ONLY place that decides. It used to be decided five times, and the
 * five disagreed: the engine asked `aspect < 0.85` (twice), the CSS asked
 * `max-width: 900px`, `720px` and `560px`. At 780x900 the engine believed it was
 * landscape while the stylesheet believed it was a phone — which is how a
 * navigation rail ends up drawn across a face.
 */
export type CompositionMode = "side" | "banded";

/**
 * Pick the axis that has room to spare.
 *
 * CALIBRATION VALUES, not law. They are meant to be moved once we look at real
 * devices — but they must only ever be moved HERE.
 */
/**
 * What BANDED physically costs, straight out of the geometry contract in
 * `globals.css`: a system bar, then a stage, and only then a workspace. If the
 * screen cannot pay for all three, banding is not a composition — it is a crush.
 *
 * These mirror `--system-bar` (min 48), `--stage-h` (min 240) and the smallest
 * workspace worth calling one: a heading, a rail and a single module.
 */
const BANDED_MIN_BAR = 48;
const BANDED_MIN_STAGE = 240;
const BANDED_MIN_WORKSPACE = 200;
export const BANDED_MIN_HEIGHT =
  BANDED_MIN_BAR + BANDED_MIN_STAGE + BANDED_MIN_WORKSPACE;

export function modeFor(width: number, height: number): CompositionMode {
  const aspect = width / Math.max(height, 1);

  /**
   * Room on both axes. The aspect floor is what keeps a big PORTRAIT tablet out:
   * an iPad Pro at 1024x1366 passes both size gates comfortably, and would then
   * have gone sideways — handing Lenox a 389px column on a screen the visitor is
   * holding upright. Size is not the question. Shape is.
   */
  const comfortableSide = width >= 900 && height >= 600 && aspect >= 0.9;

  /**
   * The screen is too short to hold three bands. A 300x300 window is neither
   * landscape nor comfortable, so it used to fall through to BANDED — where the
   * bar and the stage minimums ate 288 of its 300 pixels and left the workspace
   * TWELVE. Side is not good at that size either, but it does not put a rail on
   * his face, and it never leaves the page with nowhere to be.
   */
  const tooShortToBand = height < BANDED_MIN_HEIGHT;

  /**
   * Anything landscape goes sideways — because in landscape the horizontal axis is
   * the one with room, and banding is actively destructive there.
   *
   * The first version of this rule also demanded `width >= 720`, which sounded
   * cautious and was catastrophic: a 568x320 phone failed the width test, fell
   * into BANDED, and the geometry then reserved 48px of system bar plus a 240px
   * minimum stage out of 320px of screen — leaving the workspace THIRTY-TWO
   * PIXELS. 667x375 got 87. The rule protected a number instead of the visitor.
   *
   * 1.2 rather than 1.35: 4:3-ish landscape (1024x768 = 1.33) and anything wider
   * has a usable horizontal axis. Below that we are in portrait territory, where
   * the horizontal axis is the one that does not exist.
   */
  const landscape = aspect >= 1.2;

  return comfortableSide || landscape || tooShortToBand ? "side" : "banded";
}

/**
 * The live mode, with one deliberate cruelty: it can be FROZEN.
 *
 * Rotating the device mid-build would re-draw the seam while the seam is still
 * animating — a guaranteed layout jump at the exact moment the page is supposed
 * to be assembling itself. So the build holds the mode it started with (≤ 4s) and
 * the composition corrects itself on the first frame after READY.
 */
export function useCompositionMode(frozen: boolean): CompositionMode {
  /**
   * Starts as "side" on BOTH server and client — and that is not laziness, it is
   * the fix for a genuinely nasty bug.
   *
   * Measuring the window in the initial state made the client's first render
   * disagree with the server's HTML. React hydration does not patch a mismatched
   * attribute; it silently keeps the server's. The effect below then computed the
   * same value the initial state already held, so setState bailed out, so nothing
   * ever re-rendered — and `data-composition="side"` from the server stayed on a
   * phone forever. The layout was banded, the stage said side, and the two never
   * spoke again.
   *
   * Agreeing with the server first, then correcting in an effect, guarantees the
   * re-render that patches the DOM. The cost is one frame in side mode before the
   * wake, when the only thing on screen is a button.
   */
  const [mode, setMode] = useState<CompositionMode>("side");

  useEffect(() => {
    if (frozen) return;

    const read = () => {
      const next = modeFor(window.innerWidth, window.innerHeight);
      setMode((current) => (current === next ? current : next));
    };

    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
    };
  }, [frozen]);

  return mode;
}
