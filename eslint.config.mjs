import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Other full copies of this repo and tool output. Scanning them reported
    // 42,000 problems that were not in this tree.
    ".worktrees/**",
    ".superpowers/**",
    "graphify-out/**",
  ]),
]);

export default eslintConfig;
