import type { Metadata } from 'next';
import { Barlow_Condensed, IBM_Plex_Mono } from 'next/font/google';
import { ExperienceProvider } from './studio/ExperienceProvider';
import { DEFAULT_DESIGN_ID, DESIGN_IDS } from './studio/designRegistry';
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
const designIds = JSON.stringify(DESIGN_IDS);

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
    images: [
      {
        url: '/studio/world/hero-keyframe.jpg',
        width: 2752,
        height: 1536,
        alt: 'VOLKAN AI STUDIO digital experience',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VOLKAN AI STUDIO | Web Design and AI Systems',
    description:
      'Independent studio for high-end web design, strategic redesign and custom AI systems.',
    images: ['/studio/world/hero-keyframe.jpg'],
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
            __html:
              `try{var v=sessionStorage.getItem('volkan-studio-experience-v2')||sessionStorage.getItem('volkan-studio-experience-v1')||'{}',s=JSON.parse(v),p=new URLSearchParams(location.search),l=p.get('lang'),a=${designIds},n=function(x){return x==='reef'?'gravity':a.includes(x)?x:null},d=n(p.get('design'))||n(p.get('reality'))||n(s.design)||n(s.reality)||'${DEFAULT_DESIGN_ID}';document.documentElement.dataset.design=d;document.documentElement.lang=l==='de'||(!l&&s.locale==='de')?'de':'en'}catch(e){document.documentElement.dataset.design='${DEFAULT_DESIGN_ID}';document.documentElement.lang='en'}`,
          }}
        />
      </head>
      <body><ExperienceProvider>{children}</ExperienceProvider></body>
    </html>
  );
}
