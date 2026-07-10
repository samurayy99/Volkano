import { LenoxJourney } from "./LenoxJourney";

/**
 * Canonical Lenox journey — the acceptance surface for the real entry
 * experience. Uses the same canonical runtime as /lenox-proof (bridge in
 * lenoxMode + LenoxEyesDrive); /lenox-proof stays the technical harness.
 * After visual acceptance this becomes the basis for /.
 */
export default function LenoxPage() {
  return <LenoxJourney />;
}
