/**
 * Upper-cases a leading Windows drive letter: `c:/x` -> `C:/x`.
 *
 * VS Code opens terminals with a lowercase drive letter. Vitest then loads two
 * copies of itself (one under `c:`, one under `C:` after the resolver
 * canonicalises the path) and every test file dies with "Cannot read
 * properties of undefined (reading 'config')". See run-vitest.mjs.
 */
export function upperDriveLetter(p) {
  return p.replace(/^([a-z]):(?=[\\/]|$)/, (_, letter) => `${letter.toUpperCase()}:`);
}
