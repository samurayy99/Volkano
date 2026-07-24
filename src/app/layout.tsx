import type { Metadata } from 'next';
import { Barlow_Condensed, IBM_Plex_Mono } from 'next/font/google';
import { ExperienceProvider } from './studio/ExperienceProvider';
import { buildDesignBootstrapScript } from './studio/designRegistry';
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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://volkanaistudio.com';
const designBootstrapScript = buildDesignBootstrapScript(process.env.NODE_ENV);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'VOLKAN AI STUDIO | Web Design and AI Systems',
  description:
    'Independent studio for high-end web design, strategic redesign and custom AI systems.',
  alternates: {
    canonical: '/',
    languages: {
      en: '/',
      de: '/?lang=de',
      'x-default': '/',
    },
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'VOLKAN AI STUDIO',
    title: 'VOLKAN AI STUDIO | Web Design and AI Systems',
    description:
      'Independent studio for high-end web design, strategic redesign and custom AI systems.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VOLKAN AI STUDIO | Web Design and AI Systems',
    description:
      'Independent studio for high-end web design, strategic redesign and custom AI systems.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: designBootstrapScript,
          }}
        />
      </head>
      <body><ExperienceProvider>{children}</ExperienceProvider></body>
    </html>
  );
}
