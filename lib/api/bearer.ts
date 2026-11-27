/** Longest Authorization header value accepted; a Supabase JWT is well under 2 KB. */
export const MAX_BEARER_LENGTH = 8192;

/** The token from `Authorization: Bearer <token>`, or null. Never throws or echoes the value. */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header || header.length > MAX_BEARER_LENGTH + 64) return null;
  const m = /^bearer +(\S+)$/i.exec(header.trim());
  if (!m || m[1].length > MAX_BEARER_LENGTH) return null;
  return m[1];
}
