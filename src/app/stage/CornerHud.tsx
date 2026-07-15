"use client";

import type { CompositionMode } from "../../flow-engine/types";
import {
  LOCALES,
  isWrittenLocale,
  type Locale,
  type Messages,
} from "../../i18n/messages";
import type { StageState } from "./stageState";
import { statusFor } from "./stageState";
import { useDecode } from "./useDecode";
import styles from "./CornerHud.module.css";

type Props = {
  stage: StageState;
  gpu: "webgpu" | "fallback" | "probing";
  mode: CompositionMode;
  locale: Locale;
  setLocale: (next: Locale) => void;
  m: Messages;
};

/**
 * The instrument frame. Four corners on a desktop; ONE BAR on a phone.
 *
 * The corners are not a style choice that stops working on a small screen — at
 * 390px the corner IS the content. The bottom-left readout sat fixed on top of a
 * scrolling column and collided with it, and no amount of padding fixes a fixed
 * element over a scroller: it only postpones the collision until the text runs
 * one line longer. In BANDED the readout moves into the system bar, and the
 * overlap stops being fixed — it becomes impossible.
 */
export function CornerHud({
  stage,
  gpu,
  mode,
  locale,
  setLocale,
  m,
}: Props) {
  const status = statusFor(stage, gpu);
  const alive = status === "online" || status === "building";

  /**
   * Without WebGPU he never arrives, so the stage never leaves dormant — and
   * hiding the frame there left a fallback visitor with a dead WAKE button and no
   * explanation anywhere on screen. The readout already knows how to say NICHT
   * VERFÜGBAR; it just has to be allowed to.
   */
  const fallback = gpu === "fallback";

  // Before the wake there is only the wake.
  const visible = fallback || (stage !== "dormant" && stage !== "waking");

  /**
   * He has just found you and said one sentence. A full header at that moment —
   * brand, language switcher — turns the most charged beat on the site into the
   * top of a web page. So RECOGNITION gets the pulse and nothing else: proof the
   * instrument is running, not a masthead.
   */
  const minimal = !fallback && stage === "recognition";
  const framed = visible && !minimal;

  // Staggered, so the frame reads as a system coming up rather than three labels
  // flickering at once. Whose studio, then who is here, then what he is doing.
  const brand = useDecode(m.brand, framed, 1100, 200);
  const entity = useDecode(m.entity, framed, 800, 900);
  const statusText = useDecode(m.status[status], visible, 700, minimal ? 0 : 1400);

  return (
    <div
      className={styles.hud}
      data-mode={mode}
      data-visible={visible}
      data-framed={framed}
      aria-hidden={!visible}
    >
      <div className={`${styles.corner} ${styles.topLeft}`}>
        <span className={styles.brand}>{brand}</span>
      </div>

      <div className={`${styles.corner} ${styles.topRight}`}>
        <div className={styles.locales} role="group" aria-label="Language">
          {/* On a phone the bar has ~360px for a brand, a readout and this. FR and
              IT are honest placeholders — they are disabled, they do nothing, and
              they cost 88px of the narrowest bar we will ever draw. Desktop keeps
              them: there, admitting the gap costs nothing. */}
          {(mode === "banded"
            ? LOCALES.filter(isWrittenLocale)
            : LOCALES
          ).map((code) => {
            const ready = isWrittenLocale(code);
            return (
              <button
                key={code}
                type="button"
                className={styles.locale}
                aria-current={ready && code === locale}
                data-ready={ready}
                onClick={() => setLocale(code)}
                tabIndex={framed && ready ? 0 : -1}
                disabled={!framed || !ready}
              >
                {code}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`${styles.corner} ${styles.bottomLeft}`}>
        <span>{entity}</span>
        <span className={styles.status} data-alive={alive}>
          <i className={styles.dot} aria-hidden />
          {statusText}
        </span>
      </div>

      {/* Bottom right stays empty until there is something to leave. The way out
          only means anything once he has built a page to leave. */}
      <div className={`${styles.corner} ${styles.bottomRight}`} />
    </div>
  );
}
