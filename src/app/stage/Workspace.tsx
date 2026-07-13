"use client";

import gsap from "gsap";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LenoxEmotion } from "../../flow-engine/types";
import { REGIONS, type Messages, type Region } from "../../i18n/messages";
import { buildTimeline, primeBuild } from "./buildTimeline";
import { useDecode } from "./useDecode";
import styles from "./Workspace.module.css";

/**
 * The page he builds, in the space he vacated.
 *
 * Mounted for BUILDING and never unmounted again — what he built has to still be
 * standing afterwards, or the build was a cutscene. READY does not swap this for
 * a "real" page; it stops animating and lets you touch it.
 */
export function Workspace({
  m,
  building,
  onOperator,
  onGaze,
  onEmotion,
  onBuilt,
  onRegionChange,
}: {
  m: Messages;
  building: boolean;
  onOperator: (target: number) => void;
  onGaze: (x: number, y: number) => void;
  onEmotion: (emotion: LenoxEmotion) => void;
  onBuilt: () => void;
  onRegionChange: () => void;
}) {
  const scopeRef = useRef<HTMLElement | null>(null);
  const [region, setRegion] = useState<Region>("experience");

  // The heading may not resolve before it is on screen. The timeline says when.
  const [headingLive, setHeadingLive] = useState(false);

  // The hooks change identity on every parent render; the timeline is built once
  // and must not be torn down because a callback got a new address.
  const hooks = useRef({ onOperator, onGaze, onEmotion, onBuilt });
  useEffect(() => {
    hooks.current = { onOperator, onGaze, onEmotion, onBuilt };
  }, [onOperator, onGaze, onEmotion, onBuilt]);

  /**
   * Layout effect, not effect: the build state has to be on the elements BEFORE
   * the browser paints. An ordinary effect runs after the first paint, so the
   * visitor would see one frame of the finished page, then watch it get rebuilt.
   */
  useLayoutEffect(() => {
    const scope = scopeRef.current;
    if (!building || !scope) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = gsap.context(() => {
      primeBuild(scope);
      buildTimeline(
        scope,
        {
          onOperator: (t) => hooks.current.onOperator(t),
          onGaze: (x, y) => hooks.current.onGaze(x, y),
          onEmotion: (e) => hooks.current.onEmotion(e),
          onHeadingStart: () => setHeadingLive(true),
          onBuilt: () => hooks.current.onBuilt(),
        },
        reduced,
      );
    }, scope);

    // Reverting strips the inline styles the build wrote, which lands the
    // elements exactly where CSS already has them: visible. The page he built
    // stays standing; only the machinery that built it is cleared away.
    return () => ctx.revert();
  }, [building]);

  const content = m.content[region];
  // The heading arrives the way everything on this page arrives.
  const heading = useDecode(m.region[region], headingLive, 620);

  return (
    <section
      ref={scopeRef}
      className={styles.workspace}
      // While he is building it, it is a thing being made, not a thing to click.
      data-live={!building}
      aria-busy={building}
    >
      <span className={styles.ruleLeft} data-build-rule="v" aria-hidden />

      <nav className={styles.rail} aria-label="Workspace">
        {REGIONS.map((id) => (
          <button
            key={id}
            type="button"
            data-build="region"
            className={styles.region}
            aria-current={id === region}
            tabIndex={building ? -1 : 0}
            onClick={() => {
              if (id === region) return;
              setRegion(id);
              onRegionChange();
            }}
          >
            {m.region[id]}
          </button>
        ))}
      </nav>

      <span className={styles.ruleMid} data-build-rule="h" aria-hidden />

      <div className={styles.surface}>
        <h2 className={styles.heading} data-build="heading">
          {heading}
        </h2>
        <p className={styles.lead} data-build="content">
          {content.lead}
        </p>

        {content.pending ? (
          /* He says what he has not done. A region that admits it is unbuilt is
             honest; one filled with plausible copy is the fake proof this site
             exists to argue against. */
          <p className={styles.pending} data-build="content">
            {content.pending}
          </p>
        ) : (
          <div className={styles.modules}>
            {content.modules.map((mod) => (
              <article
                key={mod.title}
                className={styles.module}
                data-build="module"
              >
                <h3 className={styles.moduleTitle}>{mod.title}</h3>
                <p className={styles.moduleBody} data-build="content">
                  {mod.body}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
