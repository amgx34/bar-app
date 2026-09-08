import type { Metadata } from 'next';

/**
 * The staff portal's route group.
 *
 * Deliberately NOT nested under (app): that group's layout carries the manager
 * shell and its navigation, and an employee must never be handed a link into
 * payroll, settings or inventory. This group has its own chrome, in
 * me/layout.tsx, and shares only the noindex rule.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function StaffGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
