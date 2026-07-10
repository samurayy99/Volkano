import { LenoxJourney } from "./LenoxJourney";

/**
 * Canonical Lenox journey — acceptance surface for the entry experience.
 * Same canonical runtime as /lenox-proof (bridge in lenoxMode +
 * LenoxEyesDrive); /lenox-proof stays the technical harness. Becomes the
 * basis for / only after visual acceptance.
 */
export default function LenoxPage() {
  return <LenoxJourney />;
}
