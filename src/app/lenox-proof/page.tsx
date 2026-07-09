import { notFound } from "next/navigation";
import { LenoxProof } from "./LenoxProof";

/** Dev-only proof route: /lenox-proof (404 in production builds). */
export default function LenoxProofPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <LenoxProof />;
}
