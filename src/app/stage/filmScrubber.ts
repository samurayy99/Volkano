/**
 * DER FILM-SCRUBBER (World-Layer, hinterste Ebene des Hybrids).
 *
 * Classic-currentTime-Fallback hinter der Schnittstelle, die später FSV
 * (WebCodecs, frame-exakt) übernimmt: der Director liefert EINEN Fortschritt,
 * wir übersetzen ihn in eine Video-Zeit. Kein eigener Scroll-Listener.
 *
 * Event-getrieben, kein Polling: neuer Progress stößt einen Seek an, `seeked`
 * übernimmt den Folge-Seek, falls sich der Fortschritt während des Decodes
 * bewegt hat. Seeks stapeln sich nie — sonst ruckelt der Film dem Scroll
 * hinterher statt an der Hand zu liegen.
 */
export type FilmScrubber = {
  setProgress: (progress: number) => void;
  dispose: () => void;
};

export type FilmSegment = {
  start: number;
  end: number;
};

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

export function progressWithinSegment(
  progress: number,
  segment: FilmSegment,
): number {
  const length = segment.end - segment.start;
  if (length <= 0) return progress >= segment.end ? 1 : 0;
  return clamp01((progress - segment.start) / length);
}

export function createFilmScrubber(
  video: HTMLVideoElement,
): FilmScrubber {
  let desired = 0;
  let seeking = false;
  let disposed = false;

  const seekIfNeeded = () => {
    if (disposed || seeking || video.readyState < 2 || !video.duration) return;
    // Den letzten Moment aussparen: currentTime = duration wirft manche
    // Browser auf "ended" und den Posterframe zurück.
    const target = desired * Math.max(video.duration - 0.05, 0);
    if (Math.abs(video.currentTime - target) < 1 / 60) return;
    seeking = true;
    video.currentTime = target;
  };

  const onSeeked = () => {
    seeking = false;
    seekIfNeeded();
  };
  video.addEventListener("seeked", onSeeked);
  // Metadaten können nach dem ersten setProgress eintreffen.
  video.addEventListener("loadeddata", seekIfNeeded);

  return {
    setProgress(progress) {
      desired = clamp01(progress);
      seekIfNeeded();
    },
    dispose() {
      disposed = true;
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadeddata", seekIfNeeded);
    },
  };
}
