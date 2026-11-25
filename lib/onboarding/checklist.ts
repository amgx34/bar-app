import { isConnected, type PosConfigShape } from '@/lib/pos/sync-health';

export type ChecklistKey = 'pos' | 'night' | 'team' | 'stock';
export type ChecklistItem = {
  key: ChecklistKey;
  title: string;
  status: 'done' | 'todo' | 'problem';
  /** What is missing and why it matters, in one sentence. */
  why: string;
  href: string;
};
export type Checklist = { items: ChecklistItem[]; doneCount: number; allDone: boolean };

export type ChecklistInput = {
  posProvider: string | null;
  posConfig: Record<string, unknown> | null;
  employeeCount: number;
  itemCount: number;
  /** Z reports dated in the recent live window. History loaded by a backfill does not count. */
  liveZCount: number;
};

function posItem(provider: string | null, raw: Record<string, unknown> | null): ChecklistItem {
  const cfg = (raw ?? {}) as PosConfigShape;
  const title = 'Connect your POS';
  const href = provider ? '/app/settings?tab=pos' : '/setup/pos';
  const errors = Array.isArray(cfg.last_sync_errors) ? cfg.last_sync_errors : [];

  if (!provider) return { key: 'pos', title, status: 'todo', href, why: 'Sales, tips and stock all come from your POS, so nothing else fills in until it is connected.' };
  if (cfg.needs_reauth === true) return { key: 'pos', title, status: 'problem', href, why: 'Your POS no longer accepts the saved login. Reconnect it in Settings to start syncing again.' };
  if (!isConnected(provider, cfg)) return { key: 'pos', title, status: 'todo', href, why: 'Finish the connection in Settings so Rail can read your sales.' };
  if (errors.length > 0) return { key: 'pos', title, status: 'problem', href, why: 'The last sync reported a problem, so some data may be missing. Settings shows the details.' };
  if (!cfg.last_sync_at) {
    return { key: 'pos', title, status: 'todo', href, why: provider === '2touch'
      ? 'Waiting for the Rail connector on your POS computer to check in. It asks for your pairing code in Settings.'
      : 'Connected. Waiting for the first sync.' };
  }
  return { key: 'pos', title, status: 'done', href, why: 'Your POS is syncing.' };
}

export function buildChecklist(i: ChecklistInput): Checklist {
  const items: ChecklistItem[] = [
    posItem(i.posProvider, i.posConfig),
    { key: 'night', title: 'See your first night', href: '/app/sales',
      status: i.liveZCount > 0 ? 'done' : 'todo',
      why: i.liveZCount > 0 ? 'A night is in.' : 'No recent night has arrived yet. It appears after the POS closes out a day and syncs.' },
    { key: 'team', title: 'Add your team', href: '/app/settings?tab=team',
      status: i.employeeCount > 0 ? 'done' : 'todo',
      why: i.employeeCount > 0 ? 'Your team is set up.' : 'Tip splits and payroll need to know who works for you.' },
    { key: 'stock', title: 'Set up your stock', href: '/app/inventory',
      status: i.itemCount > 0 ? 'done' : 'todo',
      why: i.itemCount > 0 ? 'Your stock is set up.' : 'Stock counts and reorders need your items. A POS sync can also add them.' },
  ];
  const doneCount = items.filter((x) => x.status === 'done').length;
  return { items, doneCount, allDone: doneCount === items.length };
}

const NEW_BAR_DAYS = 30;

/** Existing bars see nothing new: only a young org, or one with no POS yet, gets the card, and never once complete. */
export function shouldShowChecklist(i: { dismissed: boolean; allDone: boolean; posProvider: string | null; createdAt: string | null; now?: Date }): boolean {
  if (i.dismissed || i.allDone) return false;
  if (!i.posProvider) return true;
  // createdAt unknown (null) reads as an established bar.
  if (!i.createdAt) return false;
  const age = (i.now ?? new Date()).getTime() - new Date(i.createdAt).getTime();
  return age < NEW_BAR_DAYS * 86_400_000;
}
