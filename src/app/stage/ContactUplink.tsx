"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CompositionMode,
  LenoxEmotion,
  LenoxReaction,
} from "../../flow-engine/types";
import type { Messages } from "../../i18n/messages";
import styles from "./ContactUplink.module.css";
import { isValidAddress, transmit } from "./uplink";

/**
 * The one real action on this site — and therefore the only place the amber
 * confirm is allowed to fire.
 *
 * The route answers three different truths and each gets its own face:
 *   sent    — Resend accepted it. Amber. He is allowed to say "done".
 *   unwired — the environment has no relay key (`dev: true`). He says so.
 *             No amber: nothing left the building.
 *   failed  — the send was attempted and did not happen. He says that too.
 *
 * Confirming an unwired send would be the exact fake proof the whole site
 * argues against, one fetch away from happening. So the gate is here, not in
 * the copy.
 */
type Phase = "idle" | "sending" | "sent" | "unwired" | "failed";

/** How long he holds the result on his face before handing back to you. */
const SETTLE_MS = 2200;

export function ContactUplink({
  mode,
  ui,
  onEmotion,
  onGaze,
  onReaction,
}: {
  mode: CompositionMode;
  ui: Messages["uplink"];
  onEmotion: (emotion: LenoxEmotion) => void;
  onGaze: (x: number, y: number) => void;
  onReaction: (reaction: LenoxReaction) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [invalid, setInvalid] = useState(false);
  const [email, setEmail] = useState("");
  // Ties the validation line to the field for assistive tech — a message that
  // merely sits near an input is invisible to a screen reader on that input.
  const noteId = useId();

  const workGaze = useMemo<readonly [number, number]>(
    () => (mode === "banded" ? [0, -0.38] : [0.42, -0.05]),
    [mode],
  );

  // Held, not watched — a parent render mid-transmission must not retarget
  // the choreography callbacks.
  const hooks = useRef({ onEmotion, onGaze, onReaction });
  useEffect(() => {
    hooks.current = { onEmotion, onGaze, onReaction };
  }, [onEmotion, onGaze, onReaction]);

  const settleTimer = useRef<number | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  // Unmount mid-transmission: abandon the request's choreography, not the
  // request — the mail may still arrive, but he must not be left frozen in
  // `acting` with scripted eyes on a region that no longer exists.
  useEffect(
    () => () => {
      inFlight.current?.abort();
      if (settleTimer.current !== null)
        window.clearTimeout(settleTimer.current);
      hooks.current.onEmotion("neutral");
      hooks.current.onGaze(0, 0);
    },
    [],
  );

  const settle = useCallback((face: LenoxEmotion) => {
    hooks.current.onEmotion(face);
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      hooks.current.onEmotion("neutral");
      hooks.current.onGaze(0, 0);
      settleTimer.current = null;
    }, SETTLE_MS);
  }, []);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      // `phase` is a render-time snapshot: two events in one tick (Enter racing
      // a click) both see "idle". The ref is the synchronous truth — and
      // `transmit` guards it again on its side, so a duplicate is
      // unrepresentable, not merely unlikely.
      if (phase === "sending" || inFlight.current) return;

      const address = email.trim();
      if (!isValidAddress(address)) {
        setInvalid(true);
        return;
      }
      setInvalid(false);
      setPhase("sending");

      // He does it in front of you: attention on the work, state ACTING.
      hooks.current.onEmotion("acting");
      hooks.current.onGaze(workGaze[0], workGaze[1]);

      const outcome = await transmit(address, {
        fetchFn: (...args) => fetch(...args),
        inFlight,
      });

      switch (outcome) {
        case "duplicate":
        case "aborted":
          // Non-events: another transmission owns the stage, or the region is
          // already gone. Nothing to say, no face to pull.
          return;
        case "sent":
          // The only amber on this site, and it just told the truth.
          setPhase("sent");
          hooks.current.onReaction("confirm");
          settle("pleased");
          return;
        case "unwired":
          setPhase("unwired");
          settle("concerned");
          return;
        case "failed":
          setPhase("failed");
          settle("concerned");
          return;
      }
    },
    [email, phase, settle, workGaze],
  );

  if (phase === "sent") {
    return (
      <div className={styles.result} aria-live="polite">
        <p className={styles.sentTitle}>{ui.sentTitle}</p>
        <p className={styles.resultBody}>{ui.sentBody}</p>
      </div>
    );
  }

  if (phase === "unwired") {
    return (
      <div className={styles.result} aria-live="polite">
        <p className={styles.honest}>
          <span className={styles.honestTitle}>{ui.unwiredTitle}</span>
          {ui.unwiredBody}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.uplink}>
      <p className={styles.brief}>{ui.brief}</p>

      <form className={styles.form} onSubmit={submit} noValidate>
        <input
          type="email"
          name="email"
          className={styles.address}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setInvalid(false);
          }}
          placeholder={ui.placeholder}
          autoComplete="email"
          spellCheck={false}
          disabled={phase === "sending"}
          aria-label={ui.placeholder}
          aria-invalid={invalid}
          aria-describedby={invalid ? noteId : undefined}
        />
        <button
          type="submit"
          className={styles.transmit}
          disabled={phase === "sending"}
        >
          {phase === "sending" ? ui.sending : ui.action}
        </button>
      </form>

      <p id={noteId} className={styles.note} aria-live="polite">
        {/* NBSP keeps the reserved line's height when there is no message. */}
        {invalid ? ui.invalid : " "}
      </p>

      {phase === "failed" ? (
        <p className={styles.honest} aria-live="polite">
          <span className={styles.honestTitle}>{ui.failedTitle}</span>
          {ui.failedBody}
        </p>
      ) : null}
    </div>
  );
}
