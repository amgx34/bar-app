/**
 * Turns the status-line errors a sync records into a sentence an owner can act
 * on. The raw text stays in last_sync_errors (the strip shows it for support);
 * this is for the settings panel.
 */
export function friendlySyncError(raw: string): string {
  const text = raw.replace(/^(api|agent):\s*/i, '');
  const provider = /clover/i.test(text) ? 'Clover' : /toast/i.test(text) ? 'Toast' : 'The POS';
  const feed = text.match(/^(?:clover|toast)\s+([a-z]+):/i)?.[1];
  const of = feed ? ` while reading ${feed}` : '';
  const code = text.match(/\b(?:Clover|Toast)\s+(\d{3})\b/i)?.[1];

  if (/reject|no longer accepts|credentials are missing/i.test(text)) return `${provider} no longer accepts the saved login. Reconnect ${provider} in Settings.`;
  if (/time zone is not set/i.test(text)) return `${provider} did not report the bar's time zone, so Rail cannot say which night a sale belongs to. Reconnect ${provider} and pick one.`;
  if (/timed out/i.test(text)) return 'The sync took too long and was stopped. It will try again on the next run.';
  if (/throttl/i.test(text) || code === '429') return `${provider} is getting too many requests right now. Rail will try again on the next sync.`;
  if (code === '401') return `${provider} no longer accepts the saved login. Reconnect ${provider} in Settings.`;
  if (code === '403') return `${provider} refused the request${of}. The connection is missing a permission; check the access you granted Rail.`;
  if (code && code.startsWith('5')) return `${provider} had trouble on their side${of}. Rail will try again on the next sync.`;
  return text;
}
