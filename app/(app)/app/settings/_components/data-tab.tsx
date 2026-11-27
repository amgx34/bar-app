'use client';

import { useActionState, useState } from 'react';
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';
import { closeBar, type CloseBarState } from '../account-actions';

const mail = <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="underline">{LEGAL_CONTACT_EMAIL}</a>;

function ExportButton() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  async function run() {
    setBusy(true); setErr(''); setDone(false);
    try {
      const res = await fetch('/api/account/export');
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? 'The export failed.');
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'rail-export.zip';
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The export failed.');
    } finally { setBusy(false); }
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={run} disabled={busy}
        className="inline-flex min-h-11 items-center rounded-lg border px-4 font-medium disabled:opacity-50">
        {busy ? 'Preparing...' : 'Download export (zip)'}
      </button>
      {busy && <p role="status" className="text-sm text-muted-foreground">This can take a few seconds.</p>}
      {done && <p role="status" className="text-sm text-muted-foreground">Export downloaded.</p>}
      {err && <p role="alert" className="text-sm text-destructive">{err} Try again, or email {mail}.</p>}
    </div>
  );
}

export function DataTab({ orgName, isOwner, isDemo, deletionOpen }: {
  orgName: string; isOwner: boolean; isDemo: boolean; deletionOpen: boolean;
}) {
  const [state, action, pending] = useActionState<CloseBarState, FormData>(closeBar, {});
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === orgName.trim() && orgName.trim() !== '';

  if (!isOwner) {
    return (
      <section className="space-y-2" aria-labelledby="data-h">
        <h2 id="data-h" className="text-xl font-semibold">Your data</h2>
        <p className="text-sm text-muted-foreground">Only the owner can export this bar&apos;s data or close it.</p>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="export-h">
        <h2 id="export-h" className="text-xl font-semibold">Export your data</h2>
        <p className="text-sm text-muted-foreground">
          One zip with a CSV for each part of the bar: inventory, deliveries, usage, sales, tips, staff and payroll.
          Bank account details and POS passwords are left out on purpose.
        </p>
        <ExportButton />
      </section>

      <section className="space-y-3 rounded-lg border border-destructive/40 p-4" aria-labelledby="close-h">
        <h2 id="close-h" className="text-xl font-semibold">Close this bar</h2>
        {isDemo ? (
          <p className="text-sm text-muted-foreground">This is a sample bar, so it cannot be closed.</p>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <p>Closing removes everyone&apos;s access and permanently deletes inventory, deliveries, usage, vendors,
                messages, POS data, sales breakdowns, bank details and connected devices. It cannot be undone.</p>
              <p>We keep payroll records, staff names, and each night&apos;s sales and tip totals, because those can be
                required for tax. They are kept but nobody can open them in Rail. Email {mail} if you need them removed.</p>
              <p>Closing does not cancel your subscription. Do that first under Billing, or you will keep being charged.</p>
              <p>Download your export first. We cannot get the data back for you.</p>
            </div>
            {!deletionOpen && (
              <p role="status" className="text-sm text-muted-foreground">
                Closing a bar from here is not switched on yet. Email {mail} and we will do it for you.
              </p>
            )}
            <form action={action} className="space-y-3">
              <label className="block text-sm font-medium" htmlFor="confirm">
                Type <span className="font-semibold">{orgName}</span> to confirm
              </label>
              <input id="confirm" name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)}
                disabled={!deletionOpen} className="min-h-11 w-full rounded-lg border bg-background px-3" />
              {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
              <button disabled={!deletionOpen || !matches || pending}
                className="min-h-11 rounded-lg bg-destructive px-4 font-medium text-destructive-foreground disabled:opacity-50">
                {pending ? 'Closing...' : 'Permanently close this bar'}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
