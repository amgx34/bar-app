import { parsePrefill, type Prefill } from '@/lib/setup/prefill';

/**
 * The settings a demo visitor may keep. The allow-list and the value limits
 * live in parsePrefill, which /setup also applies to the copy that rides on the
 * account, so both sides agree on what may cross. Items, staff and sales are not
 * settings and so cannot appear here.
 */
export function pickDemoPrefill(barSettings: unknown): Prefill {
  return parsePrefill(barSettings);
}
