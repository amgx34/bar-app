/**
 * Validates a post-login redirect target taken from a query string.
 * Only a same-site path survives: one leading slash, no `//` or `/\` (both
 * read as a host by browsers), no backslash and no control characters.
 * Anything else, including `@host` which becomes `https://ours@host`, falls back.
 */
export function safeNext(value: string | null | undefined, fallback: string): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.includes('\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
