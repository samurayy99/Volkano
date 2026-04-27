/**
 * Dev-only forensic toggles (shot ownership). Enable in the console before Enter:
 *
 *   globalThis.__VOLKANO_FORENSIC__ = true
 *   globalThis.__VOLKANO_HOLD_READ_ISOLATE__ =
 *     "feedstockOnly" | "particlesOnly" | "rodsOnly" | "crackOnly" | "allPostEnter"
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

export function forensicHoldReadIsolation() {
  if (typeof globalThis === "undefined") {
    return null;
  }

  const mode = globalThis.__VOLKANO_HOLD_READ_ISOLATE__;
  return mode === "feedstockOnly" ||
    mode === "particlesOnly" ||
    mode === "rodsOnly" ||
    mode === "crackOnly" ||
    mode === "allPostEnter"
    ? mode
    : null;
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
    run: rt.run !== false,
    gravity: rt.gravity,
    solverLocked: !!rt.solverLocked,
    postEnterArrestT: rt.postEnterArrestT ?? 0,
    postEnterHoldT: rt.postEnterHoldT ?? 0,
    postEnterFlightSec: rt.postEnterFlightSec ?? 0,
    postEnterFlightT: rt.postEnterFlightT ?? 0,
    postEnterRiftFlightActive: !!rt.postEnterRiftFlightActive,
  });
}
