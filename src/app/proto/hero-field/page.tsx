import type { Metadata } from "next";
import { HeroFieldProto } from "./HeroFieldProto";

/** Gate 1 hero material test. Lab route, not part of the public site. */
export const metadata: Metadata = {
  title: "Gate 1 — Hero Field",
  robots: { index: false, follow: false },
};

export default function HeroFieldPage() {
  return <HeroFieldProto />;
}
