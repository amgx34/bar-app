import type { Metadata, Viewport } from 'next';
import { Fira_Sans, Fira_Code } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { ThemeProvider } from '@/app/_components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from '@/lib/site';
import './globals.css';

// Design system: Fira Sans (body/UI) + Fira Code (headings + tabular numerics).
// Self-hosted by next/font rather than MASTER.md's Google Fonts @import — the
// @import would be a render-blocking third-party request on every page.
// Fira Sans has no variable cut on Google Fonts, so weights are explicit.
// Weight 300 is deliberately absent: `font-light` has zero uses in the app, and
// next/font preloads every declared weight — so it was an 18KB file fetched at
// high priority on every page load, competing with the render-blocking CSS, to
// style nothing. 400/500/600/700 are all genuinely used (6/252/148/79 call
// sites); check before removing another.
const firaSans = Fira_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fira-sans',
  display: 'swap',
});

// Fira Code *is* variable, so a range is enough.
//
// MEASURED, and deliberately left preloaded. Adding `preload: false` here was
// A/B'd against a clean production build on Lighthouse's mobile profile:
//
//   preloaded (this)    LCP 4.0s   FCP 1.2s   CLS 0
//   preload: false      LCP 3.8s   FCP 1.4s   CLS 0
//
// It buys 0.2s of LCP and gives back 0.2s of FCP. The hero <h1> is set in this
// face, so not preloading it means first paint waits on the fallback. That is a
// wash, not a win, and a wash is not worth the extra moving part.
const firaCode = Fira_Code({
  subsets: ['latin'],
  variable: '--font-fira-code',
  display: 'swap',
});

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

  // Installed to a home screen, Rail should open as its own window rather than
  // in a browser tab — the chrome eats a fifth of a small screen and puts a
  // reload button next to a stock count.
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    // 'default' keeps the iOS status bar legible over the app's own header;
    // 'black-translucent' would slide content under the clock.
    statusBarStyle: 'default',
  },
  manifest: '/manifest.webmanifest',
};

/**
 * Viewport, split out because Next requires it as its own export.
 *
 * `viewportFit: 'cover'` is what lets the layout paint into the notch and home
 * indicator areas — the `env(safe-area-inset-*)` padding the app already uses
 * resolves to 0 without it, so the bottom bar would sit on top of the home
 * indicator on every modern iPhone.
 *
 * Zoom is deliberately NOT disabled: `maximumScale: 1` is a common default that
 * breaks pinch-zoom for anyone who needs it, and WCAG treats that as a failure.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8FAFC' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1220' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is required by next-themes and only here: it
    // writes the theme class onto <html> before React hydrates, so the server
    // markup and the first client render legitimately differ on this one
    // element. It suppresses nothing inside <body>.
    <html
      lang="en"
      className={`${firaSans.variable} ${firaCode.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
        {/* Cookieless and IP-anonymised, so it needs no consent banner and does
            not contradict the "no advertising cookies" line in /privacy. */}
        <Analytics />
      </body>
    </html>
  );
}
