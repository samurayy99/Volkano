import type { Metadata } from "next";
import { PhaseFieldProto } from "./PhaseFieldProto";

/** Proof A lab route. Not part of the public site. */
export const metadata: Metadata = {
  title: "Proof A — Phase Field",
  robots: { index: false, follow: false },
};

export default function PhaseFieldPage() {
  return <PhaseFieldProto />;
}
