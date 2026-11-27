export type Channel = 'email' | 'sms';

// A recorded order is 'sent' only if at least one requested channel delivered.
// 'draft' is the existing "saved, not sent" status, so no migration is needed.
export function orderOutcome(o: { wantEmail: boolean; wantSms: boolean; emailFailed: boolean; smsFailed: boolean }) {
  const failed: Channel[] = [];
  if (o.wantEmail && o.emailFailed) failed.push('email');
  if (o.wantSms && o.smsFailed) failed.push('sms');
  const delivered = (o.wantEmail && !o.emailFailed) || (o.wantSms && !o.smsFailed);
  return { status: (delivered ? 'sent' : 'draft') as 'sent' | 'draft', failed };
}

const LABELS: Record<string, string> = {
  draft: 'Saved, not sent', sent: 'Sent', confirmed: 'Confirmed', delivered: 'Delivered', cancelled: 'Cancelled',
};
export const orderStatusLabel = (s: string) => LABELS[s] ?? 'Saved';

export function outcomeMessage(repName: string, failed: Channel[]): string {
  const what = failed.length === 2 ? 'the email and text message' : failed[0] === 'sms' ? 'the text message' : 'the email';
  return `Your order was saved, but ${what} to ${repName} did not go out. Nothing has reached them yet. Call or text ${repName} with the order, or try again in a few minutes.`;
}

// Server actions throw developer messages; show only these.
export function plainOrderError(err: unknown): string {
  const m = err instanceof Error ? err.message : '';
  if (/not authorized/i.test(m)) return 'You do not have permission to send orders.';
  if (/rep not found/i.test(m)) return 'That rep could not be found. Refresh the page and try again.';
  if (/no email address/i.test(m)) return 'This rep has no email address on file. Add one or turn off email.';
  if (/no phone number/i.test(m)) return 'This rep has no phone number on file. Add one or turn off text.';
  return 'The order could not be saved. Check the items and try again.';
}
