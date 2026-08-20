import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the pure money functions.
 *
 * Scope is deliberately narrow. Everything under test takes plain values and
 * returns plain values — no Supabase, no cookies, no clock — which is why these
 * are the parts worth testing first: they decide what people are paid and what
 * a deal is judged on, and they can be checked exactly.
 *
 * Server actions and components are NOT covered. They need a database and a
 * request context, and a test that mocks both mostly asserts the mocks ran.
 *
 * `.mts` because the nearest package.json has no `"type": "module"`, so a
 * `.ts` config gets loaded as CommonJS and warns about its own ESM syntax.
 */
export default defineConfig({
  resolve: {
    // Resolves the `@/` alias from tsconfig.json. Native since Vite 7; the
    // vite-tsconfig-paths plugin is no longer needed for this.
    tsconfigPaths: true,
  },
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
});
