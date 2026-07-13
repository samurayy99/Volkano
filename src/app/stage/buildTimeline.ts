import gsap from "gsap";
import type { LenoxEmotion } from "../../flow-engine/types";

/**
 * The build. ONE clock.
 *
 * Everything that happens between "so I will build it" and BUILT is on this
 * timeline — the DOM reveal, the camera move, where he is looking, and what he
 * is feeling. Not because a timeline is tidier than four setTimeouts, but
 * because they are one gesture: he steps aside, looks at the space, and the page
 * appears in it. Four clocks estimating that would drift, and the drift is
 * exactly the difference between "he made this" and "this appeared, and also he
 * moved".
 *
 * BUILT is not a duration anyone chose. It is the timeline saying it is done.
 * The reducer owns legality; GSAP owns time.
 */
export type BuildHooks = {
  /** 0 = centred, 1 = left third. The engine eases the move; we only start it. */
  onOperator: (target: number) => void;
  /** Screen-space gaze, -0.5..0.5. Positive x is right — where the page lands. */
  onGaze: (x: number, y: number) => void;
  onEmotion: (emotion: LenoxEmotion) => void;
  /** The heading is now visible, so this is when it may start resolving. */
  onHeadingStart: () => void;
  onBuilt: () => void;
};

/**
 * The state everything starts in, applied BEFORE the first paint.
 *
 * Without this the browser paints one frame of the finished workspace, and only
 * then does the timeline reset it to zero and start building — a flash of the
 * ending before the beginning, which gives away that the page was always there
 * and merely animated in. Exactly the illusion the whole sequence is built to
 * avoid, visible for 16 milliseconds.
 */
export function primeBuild(scope: HTMLElement): void {
  // Everything starts invisible.
  gsap.set(scope.querySelectorAll("[data-build]"), { opacity: 0 });

  // But only the things that TRAVEL start displaced. The heading and the copy
  // fade in place, so priming them with a y-offset would strand them 10px high:
  // nothing animates it back, and ctx.revert() then drops the inline transform
  // at exactly the moment the page is supposed to be standing still — a visible
  // jolt on the last frame of the build.
  gsap.set(scope.querySelectorAll("[data-build='region']"), { y: 8 });
  gsap.set(scope.querySelectorAll("[data-build='module']"), { y: 14 });

  gsap.set(scope.querySelectorAll("[data-build-rule='v']"), { scaleY: 0 });
  gsap.set(scope.querySelectorAll("[data-build-rule='h']"), { scaleX: 0 });
}

/** Named beats, so the choreography can be read and re-timed without counting. */
export const BUILD_LABELS = [
  "operator",
  "gaze_to_workspace",
  "anchor",
  "rules",
  "nav",
  "heading",
  "modules",
  "content",
  "ready",
] as const;

export function buildTimeline(
  scope: HTMLElement,
  hooks: BuildHooks,
  reduced: boolean,
): gsap.core.Timeline {
  const { onOperator, onGaze, onEmotion, onHeadingStart, onBuilt } = hooks;
  const q = (sel: string) => scope.querySelectorAll(sel);

  const tl = gsap.timeline({ onComplete: onBuilt });

  /**
   * Reduced motion still BUILDS — it just does not perform. Same causal chain,
   * same end state, no long holds. Someone who asked for less movement must not
   * end up waiting the longest to see the page.
   */
  if (reduced) {
    tl.call(() => {
      onEmotion("acting");
      onOperator(1);
      onHeadingStart();
    });
    tl.set(q("[data-build]"), { opacity: 1, y: 0 });
    tl.set(q("[data-build-rule]"), { scaleX: 1, scaleY: 1 });
    tl.to({}, { duration: 0.3 });
    tl.call(() => {
      onGaze(0, 0);
      onEmotion("neutral");
    });
    return tl;
  }

  // He leaves the centre. Everything after this lands in the room he made.
  tl.addLabel("operator", 0);
  tl.call(
    () => {
      onEmotion("acting");
      onOperator(1);
    },
    undefined,
    "operator",
  );

  // He looks at the empty space BEFORE anything is in it. That is the beat that
  // makes the page his doing rather than a thing that happened next to him.
  tl.addLabel("gaze_to_workspace", 0.9);
  tl.call(() => onGaze(0.42, -0.05), undefined, "gaze_to_workspace");

  // The seam between him and the page: the first edge, and the reason the layout
  // has an edge at all.
  tl.addLabel("anchor", 1.15);
  tl.fromTo(
    q("[data-build-rule='v']"),
    { scaleY: 0 },
    { scaleY: 1, duration: 0.9, ease: "expo.out" },
    "anchor",
  );

  tl.addLabel("rules", 1.5);
  tl.fromTo(
    q("[data-build-rule='h']"),
    { scaleX: 0 },
    { scaleX: 1, duration: 0.8, ease: "expo.out", stagger: 0.06 },
    "rules",
  );

  // A system coming up, not a list fading in.
  tl.addLabel("nav", 1.95);
  tl.fromTo(
    q("[data-build='region']"),
    { opacity: 0, y: 8 },
    { opacity: 1, y: 0, duration: 0.5, ease: "expo.out", stagger: 0.07 },
    "nav",
  );

  // The decode starts WHEN the heading becomes visible, not at mount. Otherwise
  // it resolves in the dark and what appears is a finished word — the one piece
  // of type on the page that did not arrive the way he builds.
  tl.addLabel("heading", 2.35);
  tl.call(onHeadingStart, undefined, "heading");
  tl.fromTo(
    q("[data-build='heading']"),
    { opacity: 0 },
    { opacity: 1, duration: 0.3, ease: "none" },
    "heading",
  );

  // Modules SNAP. One that eases into place looks like it was always there; one
  // that lands looks like it was put there.
  tl.addLabel("modules", 2.6);
  tl.fromTo(
    q("[data-build='module']"),
    { opacity: 0, y: 14 },
    { opacity: 1, y: 0, duration: 0.42, ease: "power4.out", stagger: 0.09 },
    "modules",
  );

  tl.addLabel("content", 3.0);
  tl.fromTo(
    q("[data-build='content']"),
    { opacity: 0 },
    { opacity: 1, duration: 0.5, ease: "none", stagger: 0.06 },
    "content",
  );

  // The page is standing. He comes back to you — and the last thing that happens
  // in the build is him looking at you, not at his work.
  tl.addLabel("ready", 3.5);
  tl.call(
    () => {
      onGaze(0, 0);
      onEmotion("neutral");
    },
    undefined,
    "ready",
  );
  tl.to({}, { duration: 0.45 }, "ready");

  return tl;
}
