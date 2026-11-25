'use client';

import { useActionState, useState } from 'react';
import { closeBar, type CloseBarState } from '../account-actions';

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
        <a href="/api/account/export" download
          className="inline-flex min-h-11 items-center rounded-lg border px-4 font-medium">
          Download export (zip)
        </a>
      </section>

      <section className="space-y-3 rounded-lg border border-destructive/40 p-4" aria-labelledby="close-h">
        <h2 id="close-h" className="text-xl font-semibold">Close this bar</h2>
        {isDemo ? (
          <p className="text-sm text-muted-foreground">This is sample data. It is deleted automatically after 24 hours.</p>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <p>Closing removes everyone&apos;s access and permanently deletes inventory, deliveries, usage, vendors,
                messages, POS data, sales breakdowns, bank details and connected devices. It cannot be undone.</p>
              <p>We keep payroll records, staff names, and each night&apos;s sales and tip totals, because those can be
                required for tax. They are kept but nobody can open them in Rail. Email us if you need them removed.</p>
              <p>Closing does not cancel your subscription. Do that first under Billing, or you will keep being charged.</p>
              <p>Download your export first. We cannot get the data back for you.</p>
            </div>
            {!deletionOpen && (
              <p role="status" className="text-sm text-muted-foreground">
                Closing a bar from here is not switched on yet. Email us and we will do it for you.
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
                className="min-h-11 rounded-lg bg-destructive px-4 font-medium text-white disabled:opacity-50">
                {pending ? 'Closing...' : 'Permanently close this bar'}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
