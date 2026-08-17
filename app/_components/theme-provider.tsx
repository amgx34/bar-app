'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * Theme plumbing.
 *
 * globals.css has carried a full `.dark` palette and `@custom-variant dark
 * (&:is(.dark *))` since the redesign, but nothing ever put that class on the
 * document — so every `dark:` utility in the app was inert and the palette was
 * dead code. This is the piece that was missing.
 *
 * `attribute="class"` is what the custom variant expects. `defaultTheme="system"`
 * means an operator who has never touched the toggle gets whatever their OS is
 * set to, which for a bar running the app on a dark POS screen at 2am is
 * usually the right answer.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // Transitions on a full palette swap look like a fault rather than a
      // choice — every surface, border and shadow easing independently.
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
