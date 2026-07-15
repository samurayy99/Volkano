"use client";

import gsap from "gsap";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  CompositionMode,
  LenoxEmotion,
  LenoxReaction,
} from "../../flow-engine/types";
import type { StationPose } from "./stations";
import { REGIONS, type Locale, type Messages, type Region } from "../../i18n/messages";
import { buildTimeline, primeBuild } from "./buildTimeline";
import { CaseTheater } from "./CaseTheater";
import { ContactUplink } from "./ContactUplink";
import { createJourneyDirector } from "./journeyDirector";
import { STATIONS } from "./stations";
import { useDecode } from "./useDecode";
import styles from "./Journey.module.css";

/**
 * DIE REISE (DER BEGLEITER, Slice 2) — ersetzt den statischen Workspace.
 *
 * Der Canvas bleibt fix; DIESES Element ist der einzige Scroller der Seite.
 * Fünf semantische Stationen geben die Strecke vor, der Director (eine
 * ScrollTrigger-Wahrheit) fährt die Kamera, führt Lenox' Zustand und
 * schaltet die Content-Bühnen. Er bleibt immer im Bild — mal begleitend,
 * mal angeschnitten groß (SYSTEMS), mal in die Tiefe zurückgetreten
 * (VOLKAN). Kein statischer Split mit schwebendem Maskottchen.
 *
 * Der Build ist unverändert seine Geste: er baut die ERSTE Station
 * (dieselbe [data-build]-Grammatik), erst mit READY wird gescrollt.
 */
export function Journey({
  m,
  locale,
  mode,
  building,
  onOperator,
  onGaze,
  onEmotion,
  onReaction,
  onPose,
  onBuilt,
  onStationChange,
}: {
  m: Messages;
  locale: Locale;
  mode: CompositionMode;
  building: boolean;
  onOperator: (target: number) => void;
  onGaze: (x: number, y: number) => void;
  onEmotion: (emotion: LenoxEmotion) => void;
  onReaction: (reaction: LenoxReaction) => void;
  onPose: (pose: StationPose, tau: number) => void;
  onBuilt: () => void;
  onStationChange: (region: Region, glance: "work" | "visitor") => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const [activeStation, setActiveStation] = useState<Region>("experience");
  const [headingLive, setHeadingLive] = useState(false);

  // Hooks in Refs — der Director und die Build-Uhr überleben Parent-Renders.
  const hooks = useRef({ onOperator, onGaze, onEmotion, onBuilt, onPose, onStationChange });
  const modeRef = useRef(mode);
  useEffect(() => {
    hooks.current = { onOperator, onGaze, onEmotion, onBuilt, onPose, onStationChange };
    modeRef.current = mode;
  }, [onOperator, onGaze, onEmotion, onBuilt, onPose, onStationChange, mode]);

  /** Der Build — identische Grammatik, Ziel ist Station 1. */
  useLayoutEffect(() => {
    // The rail is part of the build but sits beside the first section in the
    // DOM. Scope the timeline to the one authoritative scroller so both the
    // rail and Station 1 are primed before paint.
    const scope = scrollerRef.current;
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
        modeRef.current,
      );
    }, scope);
    return () => ctx.revert();
  }, [building]);

  /** Der Director — startet erst, wenn die Seite steht (READY). */
  useEffect(() => {
    if (building) return;
    const scroller = scrollerRef.current;
    const sections = sectionRefs.current.filter(Boolean) as HTMLElement[];
    if (!scroller || sections.length !== STATIONS.length) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return createJourneyDirector(
      scroller,
      sections,
      modeRef.current,
      {
        setPose: (pose, tau) => hooks.current.onPose(pose, tau),
        onStation: (index, station) => {
          setActiveStation(station.id);
          hooks.current.onEmotion(station.emotion);
          hooks.current.onStationChange(station.id, station.glance);
        },
      },
      reduced,
    );
    // mode ist während BUILDING eingefroren (useCompositionMode) und der
    // Director startet danach — modeRef genügt, kein Rebuild bei Rotation
    // mitten in der Fahrt (der nächste READY-Refresh richtet es).
  }, [building]);

  const jumpTo = useCallback((index: number) => {
    const scroller = scrollerRef.current;
    const target = sectionRefs.current[index];
    if (!scroller || !target) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({
      top: target.offsetTop,
      behavior: reduced ? "auto" : "smooth",
    });
  }, []);

  const heading = (id: Region) => m.region[id];
  const decodedFirst = useDecode(m.region.experience, headingLive, 620);

  return (
    <div
      ref={scrollerRef}
      className={styles.journey}
      data-mode={mode}
      data-live={!building}
      aria-busy={building}
    >
      {/* Die Rail — jetzt Anker der Reise: Klick fährt die Strecke. */}
      <nav className={styles.rail} aria-label="Journey">
        {REGIONS.map((id, i) => (
          <button
            key={id}
            type="button"
            data-build="region"
            className={styles.region}
            aria-current={id === activeStation}
            tabIndex={building ? -1 : 0}
            onClick={() => jumpTo(i)}
          >
            {m.region[id]}
          </button>
        ))}
      </nav>

      {/* ── Station 1: EXPERIENCE — drei Tafeln im Raum, sein Bauwerk ─────
          Keine Border-Cards (Verdikt): drei OPAKE Tafeln — Papier/Stein-
          Materie der Signatur — gestaffelt in echter Tiefe (CSS-Perspektive,
          transform-only). Beim Weiterscrollen zerlegen sie sich kausal in
          Schichten: die vorderste kreuzt den Vordergrund, die hinterste
          kippt zur Kante — aus dem Bauwerk wird sein Inneres (SYSTEMS). */}
      <section
        ref={(el) => { sectionRefs.current[0] = el; }}
        className={styles.station}
        data-station="experience"
        data-presence="side"
        style={{ minHeight: `${STATIONS[0].lengthVh}vh` }}
      >
        <span className={styles.ruleLeft} data-build-rule="v" aria-hidden />
        <div className={styles.inner}>
          <h2 className={styles.heading} data-build="heading">
            {building ? decodedFirst : heading("experience")}
          </h2>
          <p className={styles.lead} data-build="content">
            {m.content.experience.lead}
          </p>
          {/* Tafeln tragen data-build="content" (Opacity-Fade), NICHT
              "module": der Build schriebe sonst ein Inline-y-Transform, das
              die 3D-Staffelung überschreibt und bei revert() zurückschnappt. */}
          <div className={styles.plateSpace}>
            {m.content.experience.modules.map((mod, i) => (
              <article
                key={mod.title}
                className={styles.plate}
                data-plate={i}
                data-build="content"
              >
                <span className={styles.plateEdge} aria-hidden />
                <h3 className={styles.plateLabel}>{mod.title}</h3>
                <p className={styles.plateBody}>{mod.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Station 2: SYSTEMS — der Kern-Schnitt ─────────────────────────
          Kein Explosions-Diagramm, keine 01/02/03-Liste (Verdikt): sein
          Inneres als Schichten-Schnitt von der Kante gesehen — drei Strata
          mit Nähten, wie ein Bohrkern. Er selbst steht monumental
          angeschnitten links: das Ding, aus dem der Schnitt stammt. */}
      <section
        ref={(el) => { sectionRefs.current[1] = el; }}
        className={styles.station}
        data-station="systems"
        data-presence="close"
        style={{ minHeight: `${STATIONS[1].lengthVh}vh` }}
      >
        <div className={styles.inner}>
          <p className={styles.lead}>{m.content.systems.lead}</p>
          <h2 className={styles.heading}>{heading("systems")}</h2>
          <div className={styles.strata}>
            {m.content.systems.modules.map((mod, i) => (
              <article key={mod.title} className={styles.stratum} data-stratum={i}>
                <h3 className={styles.stratumTitle}>{mod.title}</h3>
                <p className={styles.stratumBody}>{mod.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Station 3: WORK — verdrahtet (Cases), nicht poliert ─────────── */}
      <section
        ref={(el) => { sectionRefs.current[2] = el; }}
        className={styles.station}
        data-station="work"
        data-presence="side"
        style={{ minHeight: `${STATIONS[2].lengthVh}vh` }}
      >
        <div className={styles.inner}>
          <h2 className={styles.heading}>{heading("work")}</h2>
          <p className={styles.lead}>{m.content.work.lead}</p>
          <CaseTheater
            locale={locale}
            mode={mode}
            ui={m.caseUi}
            onEmotion={onEmotion}
            onGaze={onGaze}
          />
        </div>
      </section>

      {/* ── Station 4: VOLKAN — er tritt zurück; ehrlich unfertig ───────── */}
      <section
        ref={(el) => { sectionRefs.current[3] = el; }}
        className={styles.station}
        data-station="volkan"
        data-presence="deep"
        style={{ minHeight: `${STATIONS[3].lengthVh}vh` }}
      >
        <div className={styles.inner}>
          <h2 className={styles.heading}>{heading("volkan")}</h2>
          <p className={styles.lead}>{m.content.volkan.lead}</p>
          {m.content.volkan.pending ? (
            <p className={styles.pending}>{m.content.volkan.pending}</p>
          ) : null}
        </div>
      </section>

      {/* ── Station 5: CONTACT — die Klammer; der echte Knopf ───────────── */}
      <section
        ref={(el) => { sectionRefs.current[4] = el; }}
        className={styles.station}
        data-station="contact"
        data-presence="front"
        style={{ minHeight: `${STATIONS[4].lengthVh}vh` }}
      >
        <div className={styles.inner}>
          <h2 className={styles.heading}>{heading("contact")}</h2>
          <p className={styles.lead}>{m.content.contact.lead}</p>
          <ContactUplink
            mode={mode}
            ui={m.uplink}
            onEmotion={onEmotion}
            onGaze={onGaze}
            onReaction={onReaction}
          />
        </div>
      </section>
    </div>
  );
}
