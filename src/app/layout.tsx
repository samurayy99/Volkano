import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VOLKANO',
  description: 'Spatial websites, real-time systems, and AI integration.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
