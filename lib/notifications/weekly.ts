import { renderWeeklyEmail } from '@/lib/email/weekly-summary';
import { resolveRecipients, type PreferenceRow, type Recipient } from './preferences';
import type { NotificationDraft } from './types';
import type { WeeklySummary } from './detect';

/**
 * Delivering one bar's weekly summary: an inbox row for everyone who wants it,
 * and an email to each of them. Every effect arrives as a dependency so tests
 * run with fakes and nothing here can send real mail by itself.
 */

/** One run's email ceiling: a stand-in for the shared Gmail app password's daily limit (UNVERIFIED). */
export const MAX_EMAILS_PER_RUN = 50;

export type WeeklyDeps = {
  /** Writes inbox rows (and whatever push the existing path does). */
  dispatch: (draft: NotificationDraft) => Promise<number>;
  /** True when this week's summary already went out for this bar. */
  alreadySent: (dedupeKey: string) => Promise<boolean>;
  emailFor: (userId: string) => Promise<string | null>;
  sendEmail: (to: string, subject: string, html: string) => Promise<void>;
  siteUrl: string;
  /** Shared across orgs within one run. */
  emailBudget: { left: number };
};

export async function deliverWeekly(
  result: { draft: NotificationDraft; summary: WeeklySummary },
  recipients: readonly Recipient[],
  preferences: readonly PreferenceRow[],
  deps: WeeklyDeps,
): Promise<{ notified: number; emailed: number; errors: string[] }> {
  const out = { notified: 0, emailed: 0, errors: [] as string[] };
  const targets = resolveRecipients(recipients, 'weekly.summary', preferences);
  if (targets.length === 0) return out;
  // A cron re-run must not send a second email: the inbox row's dedupe key is the memory.
  if (await deps.alreadySent(result.draft.dedupeKey)) return out;

  out.notified = await deps.dispatch(result.draft);

  const mail = renderWeeklyEmail(result.summary, deps.siteUrl);
  for (const t of targets) {
    if (deps.emailBudget.left <= 0) { out.errors.push('weekly email budget reached; remaining owners got the inbox row only'); break; }
    try {
      const to = await deps.emailFor(t.userId);
      if (!to) continue;
      deps.emailBudget.left--;
      await deps.sendEmail(to, mail.subject, mail.html);
      out.emailed++;
    } catch (e) {
      out.errors.push(`weekly email failed: ${String(e)}`); // one bad address must not cost the others
    }
  }
  return out;
}
