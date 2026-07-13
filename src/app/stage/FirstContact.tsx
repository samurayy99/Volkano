"use client";

import { useEffect, useRef, useState } from "react";
import { useDecode } from "./useDecode";
import styles from "./FirstContact.module.css";

/**
 * He does not speak in a bubble. A hairline grows out of him and the sentence
 * arrives ON it — the line is the proof that the words come from the entity and
 * not from a widget parked in the corner.
 *
 * The silence before it is load-bearing. He has just found you; a being that
 * starts talking the instant it can see is a chatbot with a nicer shader.
 */
const BEAT = {
  silence: 1800,
  line: 600,
  decode: 1900,
  hold: 1400,
};

/**
 * Reduced motion is not only "hold still" — it is also "do not make me wait".
 * Cutting the churn but keeping 5.7 seconds of held beats leaves the visitor who
 * asked for less motion staring at a static screen the longest.
 */
const BEAT_REDUCED = {
  silence: 300,
  line: 0,
  decode: 0,
  hold: 500,
};

export function FirstContact({
  text,
  onSpeechStart,
  onSpoken,
}: {
  text: string;
  /** The line is drawing and the sentence is starting — he is speaking NOW. */
  onSpeechStart: () => void;
  onSpoken: () => void;
}) {
  const [drawn, setDrawn] = useState(false);
  const [settled, setSettled] = useState(false);

  // The parent may re-render for reasons that have nothing to do with the beat
  // (pointer, engine frames). Re-arming these timers mid-sentence would restart
  // the decode, so the callbacks are held rather than watched.
  const cb = useRef({ onSpeechStart, onSpoken });
  useEffect(() => {
    cb.current = { onSpeechStart, onSpoken };
  }, [onSpeechStart, onSpoken]);

  // Read once, at mount. He only ever exists after the wake, so there is no
  // server render to mismatch — and the visitor does not change this preference
  // in the middle of a sentence.
  const [beat] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? BEAT_REDUCED
      : BEAT,
  );

  useEffect(() => {
    // The silence is not him speaking. He has just found you and says nothing —
    // driving `speaking` on arrival would have him talking through the one beat
    // whose whole job is that he does not.
    const line = window.setTimeout(() => {
      setDrawn(true);
      cb.current.onSpeechStart();
    }, beat.silence);
    const done = window.setTimeout(
      () => setSettled(true),
      beat.silence + beat.line + beat.decode,
    );
    const next = window.setTimeout(
      () => cb.current.onSpoken(),
      beat.silence + beat.line + beat.decode + beat.hold,
    );
    return () => {
      window.clearTimeout(line);
      window.clearTimeout(done);
      window.clearTimeout(next);
    };
  }, [beat]);

  const sentence = useDecode(text, drawn, beat.decode, beat.line);

  return (
    <div className={styles.contact} data-drawn={drawn}>
      <span className={styles.hairline} aria-hidden />

      {/* The visible line churns through random glyphs on its way to language.
          A screen reader must never be handed that noise — so the decode is
          hidden from it entirely, and the sentence is announced once, after it
          has actually settled. */}
      <p className={styles.speech} aria-hidden>
        {sentence}
      </p>
      <p className={styles.announced} aria-live="polite">
        {settled ? text : ""}
      </p>
    </div>
  );
}
