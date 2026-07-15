import type { Metadata } from 'next';
import { Barlow_Condensed, Fraunces, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/**
 * globals.css names these two faces and neither was ever loaded — the whole site
 * was silently falling back to system fonts, so the typography was an accident.
 * Loaded here, `--font-display` and `--font-mono` finally mean what they say.
 */
const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-display-loaded',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-loaded',
  display: 'swap',
});

/**
 * ALABASTER's editorial voice (Art-Direction-Rescue). A variable optical-size
 * serif — soft-but-severe, graphite on ivory — replacing the earlier
 * "Georgia via CSS variable" placeholder that the review correctly called
 * out as not a typographic decision. Mono stays the machine's voice; this is
 * the world's voice.
 */
const serif = Fraunces({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-serif-loaded',
  display: 'swap',
  axes: ['opsz'],
});

export const metadata: Metadata = {
  title: 'VOLKAN AI STUDIO — Lenox',
  description:
    'Lenox doesn\'t just answer. Lenox acts. AI Intake Systems for businesses that lose money on missed leads.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // German first — the market is Switzerland. useLocale rewrites this after
  // hydration if the visitor's browser says otherwise.
  return (
    <html
      lang="de"
      className={`${display.variable} ${mono.variable} ${serif.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
