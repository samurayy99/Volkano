"use client";

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
  locale: Locale;
  setLocale: (next: Locale) => void;
  m: Messages;
};

/**
 * The frame appears BEFORE he speaks. Half a second of a room drawing itself is
 * what tells the visitor this is an instrument that runs, not a page that loaded
 * — and it costs nothing, because the frame is four strings.
 */
export function CornerHud({ stage, gpu, locale, setLocale, m }: Props) {
  // It stays out of the dormant field: the only thing on screen before the wake
  // is the wake.
  //
  // Except when he cannot come at all. Without WebGPU the stage never leaves
  // dormant, so hiding the frame there left a fallback visitor with a dead WAKE
  // button and no explanation anywhere on screen. The readout already knows how
  // to say NICHT VERFÜGBAR — it just has to be allowed to.
  const visible = stage !== "dormant" || gpu === "fallback";
  const status = statusFor(stage, gpu);
  const alive = status === "online" || status === "building";

  // Staggered, so the frame reads as a system coming up rather than three labels
  // flickering at once. Whose studio, then who is here, then what he is doing.
  const brand = useDecode(m.brand, visible, 1100, 200);
  const entity = useDecode(m.entity, visible, 800, 900);
  const statusText = useDecode(m.status[status], visible, 700, 1400);

  return (
    <div className={styles.hud} data-visible={visible} aria-hidden={!visible}>
      <div className={`${styles.corner} ${styles.topLeft}`}>
        <span className={styles.brand}>{brand}</span>
      </div>

      <div className={`${styles.corner} ${styles.topRight}`}>
        <div className={styles.locales} role="group" aria-label="Language">
          {LOCALES.map((code) => {
            const ready = isWrittenLocale(code);
            return (
              <button
                key={code}
                type="button"
                className={styles.locale}
                aria-current={ready && code === locale}
                data-ready={ready}
                onClick={() => setLocale(code)}
                tabIndex={visible && ready ? 0 : -1}
                disabled={!visible || !ready}
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
