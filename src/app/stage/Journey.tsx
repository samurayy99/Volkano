"use client";

import gsap from "gsap";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CompositionMode, LenoxEmotion, LenoxReaction } from "../../flow-engine/types";
import { REGIONS, type Locale, type Messages, type Region } from "../../i18n/messages";
import { CaseTheater } from "./CaseTheater";
import { ContactUplink } from "./ContactUplink";
import {
  gravityCreationTimeline,
  primeGravityCreation,
} from "./gravityCreationTimeline";
import { progressWithinSegment } from "./filmScrubber";
import { createJourneyDirector } from "./journeyDirector";
import { STATIONS, type StationPose } from "./stations";
import styles from "./Journey.module.css";

/**
 * GRAVITY is mounted inert before THE COLLAPSE starts. One creation scalar
 * drives its readable typography and the engine field; after Arrival this
 * same element becomes the only vertical scroller on the page.
 */
export function Journey({
  m,
  locale,
  mode,
  armed,
  creating,
  building,
  reduced,
  onCreationProgress,
  onCreated,
  onOperator,
  onGaze,
  onEmotion,
  onReaction,
  onPose,
  onBuilt,
  onStationChange,
  onScrollProgress,
}: {
  m: Messages;
  locale: Locale;
  mode: CompositionMode;
  armed: boolean;
  creating: boolean;
  building: boolean;
  reduced: boolean;
  onCreationProgress: (progress: number, reduced: boolean) => void;
  onCreated: () => void;
  onOperator: (target: number) => void;
  onGaze: (x: number, y: number) => void;
  onEmotion: (emotion: LenoxEmotion) => void;
  onReaction: (reaction: LenoxReaction) => void;
  onPose: (pose: StationPose, tau: number) => void;
  onBuilt: () => void;
  onStationChange: (region: Region, glance: "work" | "visitor") => void;
  onScrollProgress: (progress: number, clipAProgress: number) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const buildingRef = useRef(building);
  const [activeStation, setActiveStation] = useState<Region>("experience");
  const hooks = useRef({
    onCreationProgress,
    onCreated,
    onOperator,
    onGaze,
    onEmotion,
    onPose,
    onBuilt,
    onStationChange,
    onScrollProgress,
  });

  useEffect(() => {
    hooks.current = {
      onCreationProgress,
      onCreated,
      onOperator,
      onGaze,
      onEmotion,
      onPose,
      onBuilt,
      onStationChange,
      onScrollProgress,
    };
    buildingRef.current = building;
  }, [
    building,
    onCreationProgress,
    onCreated,
    onOperator,
    onGaze,
    onEmotion,
    onPose,
    onBuilt,
    onStationChange,
    onScrollProgress,
  ]);

  useLayoutEffect(() => {
    const scope = scrollerRef.current;
    if (!creating || !scope) return;
    primeGravityCreation(scope);
    let timeline: gsap.core.Timeline | null = null;
    const frame = requestAnimationFrame(() => {
      timeline = gravityCreationTimeline(
        scope,
        mode,
        {
          setProgress: (p) => hooks.current.onCreationProgress(p, reduced),
          setOperator: (t) => hooks.current.onOperator(t),
          setGaze: (x, y) => hooks.current.onGaze(x, y),
          setEmotion: (emotion) => hooks.current.onEmotion(emotion),
          onDone: () => hooks.current.onCreated(),
        },
        reduced,
      );
    });
    return () => {
      cancelAnimationFrame(frame);
      timeline?.kill();
    };
  }, [creating, mode, reduced]);

  // Arrival transaction: initialise the sole director first, then release
  // the reducer to READY on the next frame. There is no scrollable gap.
  useEffect(() => {
    if (armed || creating) return;
    const scroller = scrollerRef.current;
    const sections = sectionRefs.current.filter(Boolean) as HTMLElement[];
    if (!scroller || sections.length !== STATIONS.length) return;
    for (const variable of [
      "--creation-p",
      "--gravity-fall",
      "--gravity-accretion",
      "--gravity-precipitation",
      "--gravity-arrival",
    ]) {
      scroller.style.setProperty(variable, "1");
    }
    scroller.dataset.creation = "complete";
    const dispose = createJourneyDirector(
      scroller,
      sections,
      mode,
      {
        setPose: (pose, tau) => hooks.current.onPose(pose, tau),
        onProgress: (progress) => {
          scroller.style.setProperty(
            "--arrival-scroll",
            Math.min(progress * 12, 1).toFixed(4),
          );
          const clipAEnd = sections[3]?.offsetTop ?? scroller.scrollHeight;
          hooks.current.onScrollProgress(
            progress,
            progressWithinSegment(scroller.scrollTop, {
              start: 0,
              end: clipAEnd,
            }),
          );
        },
        onStation: (_index, station) => {
          setActiveStation(station.id);
          hooks.current.onEmotion(station.emotion);
          hooks.current.onStationChange(station.id, station.glance);
        },
      },
      reduced,
    );
    const frame = requestAnimationFrame(() => {
      if (buildingRef.current) hooks.current.onBuilt();
    });
    return () => {
      cancelAnimationFrame(frame);
      dispose();
    };
  }, [armed, creating, mode, reduced]);

  const jumpTo = useCallback((index: number) => {
    const scroller = scrollerRef.current;
    const target = sectionRefs.current[index];
    if (!scroller || !target) return;
    scroller.scrollTo({
      top: target.offsetTop,
      behavior: reduced ? "auto" : "smooth",
    });
  }, [reduced]);

  const arrivalLine =
    locale === "en"
      ? "A permanent living interface, formed from the same matter that woke LENOX."
      : "Eine permanente lebende Oberfläche, geformt aus derselben Materie, die LENOX geweckt hat.";

  return (
    <div
      ref={scrollerRef}
      className={styles.journey}
      data-mode={mode}
      data-live={!armed && !creating && !building}
      data-armed={armed}
      data-creating={creating}
      aria-busy={armed || creating || building}
    >
      <div className={styles.worldLight} aria-hidden>
        <span className={styles.horizon} />
        <span className={styles.core} />
      </div>

      <div className={styles.creationMass} aria-hidden>
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} style={{ "--mass-line": index } as React.CSSProperties} />
        ))}
      </div>

      <header className={styles.arrival} data-gravity-line>
        <p className={styles.arrivalIndex}>{m.brand}</p>
        <h1>GRAVITY</h1>
        <p className={styles.arrivalLine}>{arrivalLine}</p>
      </header>

      <nav className={styles.rail} aria-label="Journey">
        <span className={styles.railMark}>GRAVITY</span>
        <div className={styles.railLinks}>
          {REGIONS.map((id, index) => (
            <button
              key={id}
              type="button"
              className={styles.region}
              aria-current={id === activeStation}
              tabIndex={armed || creating || building ? -1 : 0}
              onClick={() => jumpTo(index)}
            >
              {m.region[id]}
            </button>
          ))}
        </div>
      </nav>

      <section
        ref={(el) => { sectionRefs.current[0] = el; }}
        className={styles.station}
        data-station="experience"
        style={{ minHeight: `${STATIONS[0].lengthVh}vh` }}
      >
        <div className={styles.inner}>
          <p className={styles.stationIndex}>{m.region.experience}</p>
          <h2 className={styles.heading}>{m.content.experience.lead}</h2>
          <div className={`${styles.massLedger} ${styles.contentIsland}`}>
            {m.content.experience.modules.map((module, index) => (
              <article key={module.title} className={styles.massEntry}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{module.title}</h3>
                <p>{module.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        ref={(el) => { sectionRefs.current[1] = el; }}
        className={styles.station}
        data-station="systems"
        style={{ minHeight: `${STATIONS[1].lengthVh}vh` }}
      >
        <div className={styles.inner}>
          <h2 className={styles.heading}>{m.content.systems.lead}</h2>
          <div className={`${styles.strata} ${styles.contentIsland}`}>
            {m.content.systems.modules.map((module) => (
              <article key={module.title} className={styles.stratum}>
                <h3>{module.title}</h3>
                <p>{module.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        ref={(el) => { sectionRefs.current[2] = el; }}
        className={`${styles.station} ${styles.lenoxStation}`}
        data-station="lenox"
        style={{ minHeight: `${STATIONS[2].lengthVh}vh` }}
      >
        <div className={`${styles.inner} ${styles.lenoxInner}`}>
          <p className={styles.stationIndex}>{m.region.lenox}</p>
          <p className={styles.lenoxName} aria-hidden>LENOX</p>
          <h2 className={`${styles.heading} ${styles.lenoxHeading}`}>
            {m.content.lenox.lead}
          </h2>
          <div className={styles.lenoxSignals}>
            {m.content.lenox.modules.map((module) => (
              <article key={module.title} className={styles.lenoxSignal}>
                <h3>{module.title}</h3>
                <p>{module.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        ref={(el) => { sectionRefs.current[3] = el; }}
        className={styles.station}
        data-station="work"
        style={{ minHeight: `${STATIONS[3].lengthVh}vh` }}
      >
        <div className={styles.inner}>
          <h2 className={styles.heading}>{m.content.work.lead}</h2>
          <CaseTheater locale={locale} mode={mode} ui={m.caseUi} onEmotion={onEmotion} onGaze={onGaze} />
        </div>
      </section>

      <section
        ref={(el) => { sectionRefs.current[4] = el; }}
        className={styles.station}
        data-station="volkan"
        style={{ minHeight: `${STATIONS[4].lengthVh}vh` }}
      >
        <div className={styles.inner}>
          <h2 className={styles.heading}>{m.content.volkan.lead}</h2>
          {m.content.volkan.pending ? <p className={styles.pending}>{m.content.volkan.pending}</p> : null}
        </div>
      </section>

      <section
        ref={(el) => { sectionRefs.current[5] = el; }}
        className={styles.station}
        data-station="contact"
        style={{ minHeight: `${STATIONS[5].lengthVh}vh` }}
      >
        <div className={styles.inner}>
          <h2 className={styles.heading}>{m.content.contact.lead}</h2>
          <ContactUplink mode={mode} ui={m.uplink} onEmotion={onEmotion} onGaze={onGaze} onReaction={onReaction} />
        </div>
      </section>
    </div>
  );
}
