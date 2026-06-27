import { Analytics } from '@vercel/analytics/next';
import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';

import '@/app/globals.css';

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://glance.sh'),
  title: 'glance.sh',
  description: 'Share an image with your coding agent. For terminal environments where copy/pasting images is hard.',
  referrer: 'no-referrer',
  openGraph: {
    title: 'glance.sh — Share an image with your coding agent',
    description: 'Paste a screenshot, get a temporary URL. Built for terminal environments, coding agents, and CLI workflows where copy/pasting images is hard.',
    siteName: 'glance.sh',
    url: 'https://glance.sh',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'glance.sh — Share an image with your coding agent',
    description: 'Paste a screenshot, get a temporary URL. Built for terminal environments, coding agents, and CLI workflows where copy/pasting images is hard.',
  },
};

const analyticsEnabled = process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ENABLED === '1';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={mono.variable}>
        {children}
        {analyticsEnabled ? <Analytics /> : null}
      </body>
    </html>
  );
}
