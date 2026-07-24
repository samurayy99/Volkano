import type { Metadata } from "next";
import { AiSystemsExperience } from "../studio/AiSystemsExperience";

export const metadata: Metadata = {
  title: "AI Systems | VOLKAN AI STUDIO",
  description: "Transparent previews of custom AI systems for websites, project intake and communication.",
  alternates: {
    canonical: "/ai-systems",
    languages: {
      en: "/ai-systems",
      de: "/ai-systems?lang=de",
      "x-default": "/ai-systems",
    },
  },
  openGraph: {
    type: "website",
    url: "/ai-systems",
    title: "AI Systems | VOLKAN AI STUDIO",
    description: "Transparent previews of custom AI systems for websites, project intake and communication.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Systems | VOLKAN AI STUDIO",
    description: "Transparent previews of custom AI systems for websites, project intake and communication.",
  },
};

export default function AiSystemsPage() {
  return <AiSystemsExperience />;
}
