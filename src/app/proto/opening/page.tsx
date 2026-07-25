import type { Metadata } from "next";
import { OpeningProto } from "./OpeningProto";

/** Temporary prototype route for the P1 gate. Not part of the public site. */
export const metadata: Metadata = {
  title: "P1 — Opening Prototype",
  robots: { index: false, follow: false },
};

export default function OpeningProtoPage() {
  return <OpeningProto />;
}
