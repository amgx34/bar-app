import type { Metadata } from 'next';

/**
 * Passthrough layout whose only job is metadata: everything in this route group
 * (/app/* and /setup/*) sits behind auth, so it must never be indexed.
 *
 * Declaring it once here covers child pages by inheritance — including
 * setup/page.tsx, which is a Client Component and therefore cannot export
 * metadata of its own.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
