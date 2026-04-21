/**
 * Dev-only forensic toggles (shot ownership). Enable in the console before Enter:
 *
 *   globalThis.__VOLKANO_FORENSIC__ = true
 *   globalThis.__VOLKANO_FORENSIC_SETTLE_OFF__ = true   // optional: sim settle spring forced 0
 *   globalThis.__VOLKANO_FORENSIC_SUPPRESS_COMPRESS_VISUAL__ = true  // optional: rod compress read off
 */

/** Wall-clock post-enter span to emit throttled timeline logs (screenshot-relevant band). */
export const FORENSIC_POST_ENTER_LOG_WINDOW_MAX_SEC = 5.0;

export const FORENSIC_LOG_INTERVAL_SEC = 0.12;

export function forensicEnabled() {
  return (
    typeof globalThis !== "undefined" &&
    globalThis.__VOLKANO_FORENSIC__ === true
  );
}

/** When true, `runtime.settleWeight` is forced to 0 after the normal curve (MLS settle spring off). */
export function forensicSettleOff() {
  return (
    typeof globalThis !== "undefined" &&
    globalThis.__VOLKANO_FORENSIC_SETTLE_OFF__ === true
  );
}

/** When true, particle renderer uses effective compressT=0 for rod/surface compress read only. */
export function forensicSuppressCompressVisual() {
  return (
    typeof globalThis !== "undefined" &&
    globalThis.__VOLKANO_FORENSIC_SUPPRESS_COMPRESS_VISUAL__ === true
  );
}

/**
 * @param {{ _forensicPostEnterLogBucket?: number }} app
 * @param {number} elapsedSec
 * @param {object} rt
 */
export function maybeLogForensicPostEnter(app, elapsedSec, rt) {
  if (!forensicEnabled()) return;
  if (
    elapsedSec < 0 ||
    elapsedSec > FORENSIC_POST_ENTER_LOG_WINDOW_MAX_SEC
  ) {
    return;
  }
  const bucket = Math.floor(elapsedSec / FORENSIC_LOG_INTERVAL_SEC);
  if (app._forensicPostEnterLogBucket === bucket) return;
  app._forensicPostEnterLogBucket = bucket;

  console.log("[forensic post-enter]", {
    elapsedSec: Number(elapsedSec.toFixed(3)),
    recallVerticalWeight: rt.recallVerticalWeight,
    recallLateralWeight: rt.recallLateralWeight,
    settleWeight: rt.settleWeight,
    compressT: rt.compressT,
    gravity: rt.gravity,
    convergenceFreeze: rt.convergenceFreeze,
  });
}
