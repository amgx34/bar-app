/**
 * Decides whether a `supabase` CLI invocation may run, so a stray `db push`
 * cannot reach the live project. Pure: callers pass the refs in.
 * shortcut: a bare `supabase` on the PATH bypasses this; use `npm run supabase --`.
 */

/** Project ref from `https://<ref>.supabase.co`, lower-cased; '' if not a Supabase URL. */
export function projectRefFromUrl(url: string | undefined): string {
  const m = (url ?? '').trim().toLowerCase().match(/^(?:https?:\/\/)?([a-z0-9]+)\.supabase\.co(?:[:/]|$)/);
  return m ? m[1] : '';
}

const flagValue = (args: string[], flag: string): string | undefined => {
  const i = args.findIndex((a) => a === flag || a.startsWith(`${flag}=`));
  if (i < 0) return undefined;
  return args[i].includes('=') ? args[i].slice(flag.length + 1) : args[i + 1];
};

const MUTATING = new Set(['link', 'db push', 'db reset', 'db pull', 'db remote', 'migration up', 'migration repair', 'migration down']);

export function assertSupabaseAllowed(opts: {
  args: string[];
  targetRef: string;
  liveRef: string;
  allowLive: boolean;
}): void {
  const { args, liveRef, allowLive } = opts;
  const words = args.filter((a) => !a.startsWith('-'));
  const command = [words[0], words[1]].filter(Boolean).join(' ');
  const readOnly = args.some((a) => ['--version', '-v', '--help', '-h', '--dry-run'].includes(a)) || command === 'migration list';
  const remoteFlag = args.some((a) => a === '--linked' || a === '--db-url' || a.startsWith('--db-url='));
  const mutating = MUTATING.has(command) || MUTATING.has(words[0]) || remoteFlag;
  if (readOnly || !mutating || args.includes('--local') || allowLive) return;

  const explicit = flagValue(args, '--project-ref')?.toLowerCase();
  const ref = explicit || opts.targetRef;
  const hitsLive = !!liveRef && (ref === liveRef || (flagValue(args, '--db-url') ?? '').toLowerCase().includes(liveRef));
  const name = `supabase ${command || args[0]}`;
  if (hitsLive) {
    throw new Error(
      `Refusing \`${name}\`: target project ${liveRef} is the LIVE project in .env.local.\n` +
        'Run it against the dev project, or set RAIL_ALLOW_LIVE_SUPABASE=1 to do it on purpose.',
    );
  }
  if (!ref || !liveRef) {
    throw new Error(
      `Refusing \`${name}\`: cannot tell which project it targets (target ref "${ref || 'unknown'}", live ref "${liveRef || 'unknown'}").\n` +
        'Set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL for dev, or pass --local. Override: RAIL_ALLOW_LIVE_SUPABASE=1.',
    );
  }
}
