import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { CompositionMode } from "../../flow-engine/types";
import { lerpPose, STATIONS, type Station, type StationPose } from "./stations";

/**
 * DER SCROLL-DIRECTOR (DER BEGLEITER, Slice 2). Die eine Wahrheit.
 *
 * Genau EIN ScrollTrigger liest den Scroller; alles andere ist Ableitung:
 *   – die Kamera-Pose (stückweise Interpolation zwischen Stations-Posen,
 *     ausgerichtet an den ECHTEN Section-Offsets — Content-Höhen können
 *     sich ändern, die Fahrt bleibt richtig)
 *   – der Stationswechsel (Emotion + Blick, genau einmal pro Übergabe)
 *   – die Content-Bühne (data-live pro Section, CSS führt den Auftritt aus)
 *
 * Keine eigenen Scroll-Listener, keine zweiten Uhren: die Engine east die
 * Pose (tau), CSS east den Content, der Director sagt nur WO wir sind.
 *
 * Reduced Motion: keine gescrubbte Kamerafahrt — die Pose wird pro Station
 * diskret übergeben (weiches tau), der Content tritt ohne Choreografie ein.
 */
export type DirectorHooks = {
  setPose: (pose: StationPose, tau: number) => void;
  /** Eine Station hat die Führung übernommen (genau einmal pro Wechsel). */
  onStation: (index: number, station: Station) => void;
};

let pluginRegistered = false;

export function createJourneyDirector(
  scroller: HTMLElement,
  sections: readonly HTMLElement[],
  mode: CompositionMode,
  hooks: DirectorHooks,
  reduced: boolean,
): () => void {
  if (!pluginRegistered) {
    gsap.registerPlugin(ScrollTrigger);
    pluginRegistered = true;
  }

  const poses = STATIONS.map((s) => s.pose[mode === "banded" ? "banded" : "side"]);
  let active = -1;

  const drive = () => {
    const y = scroller.scrollTop;
    // Keyframes an den realen Section-Starts; Pose i gilt, wenn Section i
    // die Oberkante erreicht hat.
    let index = 0;
    let frac = 0;
    for (let i = 0; i < sections.length - 1; i++) {
      const a = sections[i].offsetTop;
      const b = sections[i + 1].offsetTop;
      if (y >= b) {
        index = i + 1;
        frac = 0;
        continue;
      }
      if (y >= a) {
        index = i;
        frac = b > a ? (y - a) / (b - a) : 0;
      }
      break;
    }

    const next = Math.min(index + 1, poses.length - 1);
    const eased = frac * frac * (3 - 2 * frac); // smoothstep pro Segment

    // Bühnen-Fortschritt: jede Section bekommt ihren Segment-Fortschritt als
    // CSS-Variable — die Platten-Choreografie liest NUR diese Zahl (eine
    // Quelle, transform-only, kein zweiter Listener). Sections ausserhalb
    // des aktiven Segments stehen auf 0/1, damit nichts halb hängt.
    for (let i = 0; i < sections.length; i++) {
      const sp = i < index ? 1 : i > index ? 0 : frac;
      sections[i].style.setProperty("--sp", sp.toFixed(4));
    }

    if (!reduced) {
      // tau 0.06, nicht 0.28: beim Scrubben stapelt sich Engine-Easing auf
      // das Momentum des Scrollers — 280 ms Nachlauf lasen sich als Gummi-
      // band (peer-review trap #3). Klein genug, um Scroll-Jitter zu
      // schlucken; direkt genug, dass die Kamera der Hand gehört.
      hooks.setPose(lerpPose(poses[index], poses[next], eased), 0.06);
    }

    // Die Führung wechselt in der Segmentmitte — nicht an der Kante, sonst
    // flattert der Zustand beim Pendeln um die Grenze.
    const leadIndex = frac < 0.5 ? index : next;
    if (leadIndex !== active) {
      active = leadIndex;
      if (reduced) {
        hooks.setPose(poses[leadIndex], 0.6);
      }
      hooks.onStation(leadIndex, STATIONS[leadIndex]);
    }
  };

  const trigger = ScrollTrigger.create({
    scroller,
    // Die Strecke ist der Scroller selbst; wir brauchen nur seine Updates.
    start: 0,
    end: () => Math.max(scroller.scrollHeight - scroller.clientHeight, 1),
    onUpdate: drive,
    onRefresh: drive,
  });

  // Content-Bühne: eine Section ist "live", solange sie im Fenster arbeitet.
  const sectionTriggers = sections.map((section) =>
    ScrollTrigger.create({
      scroller,
      trigger: section,
      start: "top 78%",
      end: "bottom 12%",
      onToggle: (self) => {
        section.dataset.live = self.isActive ? "true" : "false";
      },
    }),
  );

  drive();

  /**
   * Fraunces lädt mit display:swap NACH dem Mount und reflowt die Sections —
   * die ScrollTrigger-GRENZEN (start/end der Bühnen-Toggles) sind dann
   * veraltet, während die Pose live aus offsetTop liest (peer-review trap
   * #4: Grenzen kalt, Posen warm). Ein Refresh, sobald die Fonts stehen.
   */
  let fontsRefreshCancelled = false;
  document.fonts?.ready?.then(() => {
    if (!fontsRefreshCancelled) ScrollTrigger.refresh();
  });

  return () => {
    fontsRefreshCancelled = true;
    trigger.kill();
    sectionTriggers.forEach((t) => t.kill());
  };
}
