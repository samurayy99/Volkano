"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LenoxEmotion, LenoxSignatureId } from "../../flow-engine/types";
import type { Locale, Messages } from "../../i18n/messages";
import type { CalibrationChoice } from "./calibration";
import { pickReason } from "./calibration";
import { pickL, STAGE_SIGNATURES } from "./signatures";
import styles from "./FirstContact.module.css";

/**
 * FIRST CONTACT — jetzt mit der einen Frage (DER BEGLEITER, Akt II+III).
 *
 * Er findet dich, sagt einen Satz, und stellt die einzige Frage, die ein
 * Fremder in zwei Sekunden beantworten kann: wer bestimmt die Handschrift.
 * Beide Antworten münden in DIESELBE Maschine — der Unterschied ist nur, wer
 * gewählt hat:
 *
 *   LENOX — er liest das Partikelspiel (resolveLenoxChoice) und begründet
 *           seine Wahl in einem Satz. Der Satz IST die Begründung.
 *   DU    — zwei Signatur-Worte auf derselben Hairline (Minimalform, Slice 1;
 *           die Membran kommt in Slice 3). Er kommentiert die Wahl.
 *
 * Danach: onCommit(id) → die Verwandlung. Kein Menü, kein Intake, kein toter
 * Button.
 */

/**
 * Kein Scramble mehr (AD-Review: Hacker-Klischee — "editorial serif does not
 * scramble"). Sätze werden von der Hairline her AUFGEDECKT (clip-wipe, CSS),
 * nicht durch Glyphen-Churn errechnet. Die Beats takten nur noch, WANN.
 */
const BEAT = {
  silence: 1800,
  reveal: 900,
  askHold: 700,
  think: 1100,
  speakHold: 2400,
  commitHold: 700,
};

/** Reduced motion: gleiche Kausalkette, keine langen Halte. */
const BEAT_REDUCED = {
  silence: 300,
  reveal: 0,
  askHold: 200,
  think: 350,
  speakHold: 900,
  commitHold: 300,
};

type Phase = "silence" | "greet" | "ask" | "pick" | "think" | "speak";
type Line = { text: string; voice: "machine" | "world" };

export function FirstContact({
  m,
  locale,
  onSpeechStart,
  onEmotion,
  resolveLenoxChoice,
  onCommit,
}: {
  m: Messages;
  locale: Locale;
  /** The line is drawing and the sentence is starting — he speaks NOW. */
  onSpeechStart: () => void;
  onEmotion: (emotion: LenoxEmotion) => void;
  /** Weg A: die Kammer hat gemessen; hier fällt die deterministische Wahl. */
  resolveLenoxChoice: () => CalibrationChoice;
  /** Die Frage ist beantwortet, sein Satz gesprochen — die Welt wechselt. */
  onCommit: (id: LenoxSignatureId) => void;
}) {
  const [phase, setPhase] = useState<Phase>("silence");
  const [drawn, setDrawn] = useState(false);
  const [line, setLine] = useState<Line>({ text: "", voice: "machine" });

  // Parent re-renders (pointer, engine frames) must never re-arm the beats.
  const cb = useRef({ onSpeechStart, onEmotion, resolveLenoxChoice, onCommit });
  useEffect(() => {
    cb.current = { onSpeechStart, onEmotion, resolveLenoxChoice, onCommit };
  }, [onSpeechStart, onEmotion, resolveLenoxChoice, onCommit]);
  const mRef = useRef(m);
  const localeRef = useRef(locale);
  useEffect(() => {
    mRef.current = m;
    localeRef.current = locale;
  }, [m, locale]);

  const [beat] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? BEAT_REDUCED
      : BEAT,
  );

  // One shared timer store; unmount kills every pending beat.
  const timers = useRef<number[]>([]);
  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout);
    },
    [],
  );

  // The opening: silence → greeting (machine voice) → THE question (world
  // voice, display size). `listening`, not `curious` — the Premium-Instrument
  // rule bans the wink at the most serious beat of the page.
  useEffect(() => {
    after(beat.silence, () => {
      setDrawn(true);
      setLine({ text: mRef.current.greeting, voice: "machine" });
      setPhase("greet");
      cb.current.onSpeechStart();
    });
    after(beat.silence + beat.reveal + beat.askHold, () => {
      setLine({ text: mRef.current.calibration.question, voice: "world" });
      setPhase("ask");
      cb.current.onEmotion("listening");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat]);

  /** Der gesprochene Abschluss beider Wege — dann fällt die Welt. */
  const speakAndCommit = useCallback(
    (text: string, id: LenoxSignatureId, emotion: LenoxEmotion) => {
      cb.current.onEmotion(emotion);
      setLine({ text, voice: "world" });
      setPhase("speak");
      after(beat.speakHold + beat.commitHold, () => cb.current.onCommit(id));
    },
    [after, beat],
  );

  const chooseLenox = useCallback(() => {
    setPhase("think");
    setLine({ text: "", voice: "machine" });
    cb.current.onEmotion("thinking");
    after(beat.think, () => {
      const choice = cb.current.resolveLenoxChoice();
      speakAndCommit(
        pickReason(choice, localeRef.current),
        choice.id,
        "speaking",
      );
    });
  }, [after, beat, speakAndCommit]);

  const chooseYou = useCallback(() => setPhase("pick"), []);

  const pickSignature = useCallback(
    (id: LenoxSignatureId) => {
      const sig = STAGE_SIGNATURES.find((s) => s.id === id);
      if (!sig) return;
      // "speaking", nicht "pleased": kein Lächel-Beat direkt vor der
      // ernstesten Operation der Seite (Premium-Instrument-Regel).
      speakAndCommit(pickL(sig.choiceComment, localeRef.current), id, "speaking");
    },
    [speakAndCommit],
  );

  return (
    <div className={styles.contact} data-drawn={drawn}>
      <span className={styles.hairline} aria-hidden />

      <div className={styles.column}>
        {/* Aufgedeckt, nicht errechnet: der Satz wird von der Hairline her
            freigelegt (CSS-Wipe via key-remount). Machine voice = mono,
            world voice = display — der Kontrast ist das Konzept. */}
        <p
          key={line.text}
          className={styles.speech}
          data-voice={line.voice}
          aria-hidden
        >
          {line.text}
        </p>
        <p className={styles.announced} aria-live="polite">
          {line.text}
        </p>

        {phase === "ask" ? (
          <div
            className={styles.answers}
            role="group"
            aria-label={m.calibration.question}
          >
            <button type="button" className={styles.answer} onClick={chooseYou}>
              {m.calibration.you}
            </button>
            <span className={styles.answerDivider} aria-hidden />
            <button
              type="button"
              className={styles.answer}
              onClick={chooseLenox}
            >
              {m.calibration.lenox}
            </button>
          </div>
        ) : null}

        {phase === "pick" ? (
          <div className={styles.answers} role="group" aria-label={m.calibration.question}>
            {STAGE_SIGNATURES.map((sig, i) => (
              <span key={sig.id} className={styles.pickEntry}>
                {i > 0 ? <span className={styles.answerDivider} aria-hidden /> : null}
                <button
                  type="button"
                  className={styles.answer}
                  onClick={() => pickSignature(sig.id)}
                >
                  {sig.label}
                  <em className={styles.hint}>{pickL(sig.hint, locale)}</em>
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
