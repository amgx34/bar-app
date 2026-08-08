import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  // Lets every route below express canonical/OG URLs as relative paths.
  metadataBase: new URL(SITE_URL),

  title: {
    // `default` covers routes that set no title of their own; `template` wraps
    // the ones that do, so no two pages ship the same <title> any more.
    default:  `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,

  // NOTE: canonical and og:url are deliberately NOT set here. Metadata is
  // inherited by every child route, so a canonical of '/' at the root would
  // tell crawlers that /login and every /app page are duplicates of the home
  // page. Each indexable route declares its own instead.

  openGraph: {
    type:        'website',
    siteName:    SITE_NAME,
    title:       `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    locale:      'en_US',
  },
  twitter: {
    card:        'summary_large_image',
    title:       `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },

  // The app itself lives behind auth; only the marketing page and login are
  // public, and each opts in/out explicitly.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },

  formatDetection: { telephone: false, address: false, email: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        <TooltipProvider>
          {children}
        </TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
