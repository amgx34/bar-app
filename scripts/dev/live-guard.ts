/**
 * Keeps `npm run dev` away from the live database.
 *
 * `.env.local` holds the live Supabase project and Next reads it for every
 * command. For `next dev` the file `.env.development.local` wins over it, so a
 * dev project's keys go there. These helpers refuse to start dev when both
 * resolve to the same Supabase host.
 */

/** Lower-case host only: no scheme, port, path or trailing slash. */
export function normalizeHost(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

/** Reads one key from dotenv text. Ignores comment lines; strips one pair of quotes. */
export function readEnvValue(text: string, key: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || m[1] !== key) continue;
    let value = m[2].trim();
    const quoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
    if (quoted) value = value.slice(1, -1);
    return value;
  }
  return undefined;
}

/** Throws unless the dev Supabase URL is set and is not the live one. */
export function assertDevIsNotLive(
  devUrl: string | undefined,
  liveUrl: string | undefined,
  allowLive: boolean,
): void {
  const dev = normalizeHost(devUrl ?? '');
  if (!dev) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is not set for development. Create .env.development.local with the dev project URL and keys.',
    );
  }
  // A real host has a dot (abc.supabase.co) or is a local address. Anything else is
  // a leftover placeholder or a typo, and starting on it would only fail later.
  if (!dev.includes('.') && dev !== 'localhost') {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL is "${devUrl}", which is not a real address. ` +
        'Replace the placeholder in .env.development.local with the new project URL and save the file.',
    );
  }
  const live = normalizeHost(liveUrl ?? '');
  if (live && dev === live && !allowLive) {
    throw new Error(
      `Refusing to start: dev would use ${dev}, the project in .env.local, which is treated as LIVE.\n` +
        'Put the dev project keys in .env.development.local (it wins over .env.local for `next dev`).\n' +
        'To run against the live project on purpose, set RAIL_ALLOW_LIVE_DEV=1.',
    );
  }
}

/**
 * Keys that let the app reach a real third party: send mail or SMS, call a paid
 * model, or talk to a POS. A dev server holding the live copy of any of these
 * can message real people or spend real money while "just testing".
 */
export const THIRD_PARTY_KEYS = [
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'GROQ_API_KEY',
  'CLOVER_CLIENT_ID',
  'VAPID_PRIVATE_KEY',
];

/**
 * Keys whose dev value is identical to a non-blank value in the live .env.local.
 *
 * A blank line in .env.development.local does NOT neutralise a key: Next keeps
 * the live value from .env.local, which is how a dev server ended up holding the
 * live Gmail, Twilio and Groq keys while the file said "deliberately not set".
 */
export function findLeakedLiveKeys(
  devEnv: Record<string, string | undefined>,
  liveText: string,
  keys: string[] = THIRD_PARTY_KEYS,
): string[] {
  return keys.filter((key) => {
    const live = readEnvValue(liveText, key);
    return !!live && devEnv[key] === live;
  });
}

/** Throws when dev holds live third-party keys, unless explicitly allowed. */
export function assertNoLiveThirdPartyKeys(leaked: string[], allow: boolean): void {
  if (!leaked.length || allow) return;
  throw new Error(
    `Refusing to start: dev would use the LIVE values of ${leaked.join(', ')} from .env.local.\n` +
      'That lets a dev session send real email or SMS and call paid services.\n' +
      'A blank value in .env.development.local does NOT override .env.local. Set each key there to a\n' +
      'non-empty placeholder instead (for example GROQ_API_KEY=disabled-in-dev).\n' +
      'To use the live keys on purpose, set RAIL_ALLOW_LIVE_THIRD_PARTY=1.',
  );
}
