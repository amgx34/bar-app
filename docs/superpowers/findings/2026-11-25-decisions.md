# Owner decisions, delegated and decided (2026-11-25)

Reasoned from the repo only. No application source was edited, nothing was staged or committed, no worktree was touched, no .env was read. Checks run: `npm test` (60 files, 1002 tests, all pass), `npx tsc --noEmit` (clean), `npm run audit:scope` (0 unjustified), eslint on the changed files (3 errors and 5 warnings, all on lines the held diffs do not touch: `any` at payroll/actions.ts 92, 688, 697 and unused-expression warnings in settings/actions.ts).

---

## 1. Tips double-count

**DECISION:** (a) The code is wrong. The Z total already contains every server's tips, so the pool must exclude what `individual` and `sales_pct` staff receive. The seed is right.

**CONFIDENCE:** high for bars that upload the text Z report. Medium-high for bars on the POS agent (one cheap check below closes it).

**EVIDENCE**
- Real data, to the cent. `Z_REPORT_SCHEMA.md:225-255` is a real Scotty's On Vine Z (4/18/2026). Z "Tips Paid Out" is 1099.20 (line 241). The five per-server tips are 258.85 + 252.51 + 414.85 + 2.00 + 170.99 = 1099.20 (lines 250-254). The per-server rows are a breakdown of the Z total, not an addition to it.
- The text-Z save stores that total as the night's tips: `payroll/actions.ts:446-455` writes `cc_tips: totalTips` (parsed from the same "Tips Paid Out" line, `lib/csv-parsers/parse-z-report-text.ts:70-76`), and writes the per-server rows to `z_report_server_tips` from the same file. So both come from one document that reconciles.
- Agent path: `cc_tips` is the sum of card-payment `fTipAmt` across all tickets (`2touch-agent-dotnet/Setup/TwoTouchProfile.cs:75-76`, cash tips on the next line). Per-server `tips_paid_out` is `tblTips.fTotalTips` per clock row (`TwoTouchProfile.cs:108`). A server's tips are a slice of the ticket tips, so they are inside the Z total by construction. Not proven by data in the repo, only by the model of the feed.
- The code: `payroll/actions.ts:786-789` sets `dailyTips` to the full Z total. The barback cut, opener bonus and hours-weighted pool all use it (lines 800-855). Lines 861-880 then add `serverEntry.tipsPaidOut` (individual) and `share * dailyTips` (sales_pct) on top, with nothing removed from the pool.
- The code contradicts itself. `payroll/actions.ts` (comment above the transfers step) says "the night still reconciles against the Z report", `lib/payroll/tip-pool.ts:311` says "payroll has to reconcile against the Z report", and `lib/payroll/adjustments.ts:188` says the same. Every existing tip test checks conservation only for pool and barback modes (`tip-pool.test.ts:157-170`). Nothing covers individual or sales_pct, which is how this survived.
- Walk numbers match the mechanism exactly (for-owner-p0-p1.md update): 11-19 payroll $1,596 vs Z $1,212, gap $384 = Danny Rivera's night. November gap $1,792 = Danny's total.
- Seed (`lib/demo/seed.ts:289-301`) models the real shape: server tips sum to `cc_tips`.

**WHAT WOULD CHANGE THE DECISION:** an agent-fed real night where the sum of `z_report_server_tips.tips_paid_out` is clearly larger than, or unrelated to, `cash_tips + cc_tips`. Then individual tips live outside the Z figure for that feed and the fix needs a per-feed rule. Run this read-only on a real agent bar:

```sql
select d.report_date, d.cash_tips + d.cc_tips as z_total,
       coalesce(sum(t.tips_paid_out), 0) as server_sum
from z_report_days d
left join z_report_server_tips t
  on t.organization_id = d.organization_id and t.report_date = d.report_date
where d.organization_id = '<real bar org id>' and d.report_date >= current_date - 14
group by 1, 2 order by 1;
```

`server_sum` at or just under `z_total` (cash tips left in a jar make it slightly under) confirms (a). Also worth running: `select name, tip_mode from employees where tip_mode in ('individual','sales_pct')` on every real org. If none exist, no real bar has been overpaid and this is a latent bug.

**INTENDED BEHAVIOUR (do not write the fix yet)**
1. Per night: Z total, then unattributed removals (unchanged), giving `dailyTips`.
2. Carve out first, before the barback cut: each `individual` employee's matched `tipsPaidOut`, and each `sales_pct` employee's share. Compute the sales_pct share against `dailyTips` less the individual amounts so the two cannot jointly exceed the night.
3. Barback cut, opener bonus and the hours-weighted pool run on the remainder: `dailyTips - individual - sales_pct`, floored at 0.
4. A server-breakdown name that matches no employee is not carved out, so it stays in the pool. Nothing disappears.
5. If the carve-outs exceed `dailyTips` (bad data), pool = 0 and the night is flagged in the day split, never silently over-allocated.
- Test to add, in a new pure function (suggest `lib/payroll/night-split.ts`) so it can be tested without Supabase: for a night with a pool of 3, one barback, one individual and one sales_pct employee, the sum of every employee's allocation equals the Z total (to the cent), and the individual employee's allocation equals their `tipsPaidOut` exactly. Add the same assertion for the no-carve-out case so the existing behaviour is pinned, and a case where the individual name matches nobody (total still conserved).

**BLAST RADIUS (every consumer of `computePayroll`):** `payroll/page.tsx`, `payroll/review/page.tsx`, `_components/day-split-tab.tsx`, `lib/payroll/day-value.ts`, `lib/payroll/tip-ledger.ts`, `payroll/payout-actions.ts` (pay-out balances), `payroll/approval-actions.ts` and `lib/payroll/run-diff.ts` (the frozen run snapshot), `payroll/run-withholding.ts` and `lib/payroll/tax/run.ts` (withholding), `app/api/payroll/nacha/route.ts` (direct-deposit file), `tax/actions.ts`, `books/actions.ts`, and the staff portal `app/(staff)/me/actions.ts`. Pool-mode staff see smaller tips afterwards (correctly). Any already-approved run keeps its snapshot, but `run-diff` will show a diff on any open run that includes an individual or sales_pct employee. Existing paid history is not restated.

**NEXT ACTION:** Owner (or Claude on request): run the two queries above on a real org. Claude: write the pure night-split function and the conservation test first (red), then wire it in. It touches payroll money, so the owner reviews before and after.

---

## 2. Employee delete

**DECISION:** Deactivate instead of delete. Add `employees.archived_at timestamptz` (null = active), replace "Remove" with "Archive", add no DELETE policy, and keep hard delete unavailable. Until that ships, keep the honest error that is already in place.

**CONFIDENCE:** medium-high. The risk analysis is clear. The size of the filter change across readers is the uncertainty.

**EVIDENCE**
- `supabase/schema-export/baseline.sql:1698-1706`: employees has INSERT, SELECT and UPDATE policies only. No DELETE policy, so RLS refuses every delete, including the owner's.
- There is no active or archived column today (`baseline.sql:443-461`, and the live export lists the same columns). Nothing to reuse.
- A real delete would destroy history. `ON DELETE CASCADE` from employees: `payroll_payouts` (`baseline.sql:1310`), `payroll_adjustments` (1296, 1300), `employee_shifts` (1252), `direct_deposit_accounts` (1240), `employee_accounts` (1246). So adding a DELETE policy removes someone's payout ledger, tip transfers and hours. That is the pay record a bar needs for tax filings and disputes. `pos_server_sales` is the only FK that is `SET NULL` (1338). The UI already warns "This will also delete their shift history" (`employees-tab.tsx:44`, `employee-roster.tsx:86`), which understates it: payouts and adjustments go too.
- Approved pay runs freeze figures in `payroll_runs.snapshot`, which survives, but the payout ledger that proves who was paid does not.
- Who may call it now: `deleteEmployee` (`payroll/actions.ts:137-162`) has no role check. Any member can attempt it. Only two callers, both catch and toast the error (`employees-tab.tsx:54`, `employee-roster.tsx:98`). `canManagePayroll` exists (`lib/permissions.tsx:27`) and is the right gate.
- Admin-client deletion would work and pass `audit:scope`, but it is exactly the permanent data loss above, now without RLS as a backstop. Rejected.
- The POS agent re-creates unknown employees by name on ingest (`app/api/2touch/ingest/route.ts:~377-405`, `tip_mode: 'pool'`). A hard-deleted employee who is still on the POS comes back as a fresh pool employee with no pay type or rate on the next five-minute sync. Archiving avoids that, since the name is still found.

**WHAT WOULD CHANGE THE DECISION:** if the owner wants GDPR-style erasure, or the first employees to remove were created by mistake with no payouts. In that case allow hard delete only when the employee has no payouts, adjustments or shifts, gated by `canManagePayroll`, via the admin client with `.eq('organization_id', org.id)` and an `admin-scope-ok` note.

**IMPLEMENTATION NOTES**
- There are about 26 `from('employees')` call sites. Filter archived staff out of the roster, the employees tab, shift and day pickers, and bulk tip-mode. Do NOT filter them out of `computePayroll` for a period in which they have shifts, payouts or adjustments, or a leaver's final pay disappears from the run. Ingest needs no change.
- Gate the archive action with `canManagePayroll`. Add a migration under `supabase/migrations/` (the base tables were created outside the repo, so use `ADD COLUMN IF NOT EXISTS`).

**NEXT ACTION:** Claude: migration plus archive action plus filters, with a test that an archived employee with shifts in the period still appears in payroll. Owner: confirm that "Archive" replacing "Remove" is acceptable wording.

---

## 3. The three held fixes

### 3(i) Payout settled tolerance (`lib/payroll/payouts.ts`, `payouts.test.ts`, `payout-controls.tsx`)

**VERDICT: APPROVE as is.** Confidence high.
- It fixes the exact P1: `summarizePayouts` used `balance <= 0` while `planBulkPayout` used `<= 0.005`. Both and the per-cell `PayoutCell` now share one exported constant (`payouts.ts:85`). `grep` shows no other copy of the settled test. The one remaining literal `0.005` is `payout-actions.ts:215`, the single-payment overpay cap, which is a different rule (not a settled test) and deliberately untouched.
- Boundary at exactly 0.005: with float arithmetic, `1234.565 - 1234.56 = 0.005000000000109` (counts as owed) and `100.005 - 100 = 0.0049999999999955` (settled). So the exact half-cent is decided by float noise. That is not new (the planner already did this) and every surface now agrees, which is the point. It is also harmless: a half-cent cannot be paid (payments are cent-rounded), and a balance of 0.006 to 0.009 is still planned and rounds to $0.01.
- Overpayment display unchanged: `balance = Math.max(0, ...)` in the cell; the summary clamps by treating negative as settled.
- A legitimately half-cent-short balance is shown as paid. Acceptable: nothing payable remains.
- Reusing the constant for the over-cap comparison (`payouts.ts:244`) keeps the old numeric behaviour.
- Tests: new cases cover under half a cent (settled) and a real cent (owed). Suite green, tsc clean.
- Optional, not required: add a test for 0.006 owed so the lower edge is pinned.

### 3(ii) Routing number validation (`lib/direct-deposit/routing.ts`, `routing.test.ts`, `crypto.ts`, `settings/actions.ts`, `general-tab.tsx`, `api/payroll/nacha/route.ts`)

**VERDICT: APPROVE as is.** Confidence high. One thing to know, no change needed.
- Checksum is the unchanged ABA formula, moved to a dependency-free file so the browser can import it; `crypto.ts` re-exports it, so existing callers keep working. The tests use real numbers (021000021, 011401533) and cover the 12345 case that used to save.
- Server check (`settings/actions.ts:74`) lets blank through (clears the field) and rejects any non-blank invalid value. The NACHA route (`route.ts:62`) re-validates a value saved earlier and answers 422 with a plain message rather than building a bad ACH file.
- Already-saved invalid number: the export is blocked until it is fixed (intended, since the bank rejects the file anyway). The dev org that holds the walker's `12345` will 422 at export. Side effect: because the General tab saves all its fields in one action, a bad or half-typed routing number also blocks saving unrelated fields on that tab (name, tax rate) until it is fixed or cleared. The inline error and the toast say why. Acceptable.
- `routingInvalid` is declared after `handleSave` but only read when the event fires, so there is no temporal-dead-zone problem. tsc agrees.
- No seed or demo data sets `nacha_routing_number`, so demos are not newly blocked. A legacy value stored with dashes or spaces would now be refused at export; the old UI stripped non-digits on input, so this is unlikely.

### 3(iii) `deleteEmployee` throws when zero rows are deleted (`payroll/actions.ts:137-162`)

**VERDICT: APPROVE as is.** Confidence high, with one honest caveat.
- It replaces a silent false success with an error. Both callers (`employees-tab.tsx:54`, `employee-roster.tsx:98`) already catch and toast `err.message`. No caller relied on a silent no-op. The `.eq('organization_id', org.id)` stays, so tenancy is intact.
- Caveat: until decision 2 ships, the Remove button always shows that error, for everyone. That is correct and better than lying, but the owner should expect it. The error text says "may already be gone, or you may not have permission", which is true of the cause, though it does not explain that no one can delete. When decision 2 lands, this function should be retired.

**NEXT ACTION:** Claude (on owner's go): commit as three commits, one per fix, so each can be reverted alone.

---

## 4. Stale worktrees

**DECISION:** Nothing to remove. Both worktrees are already gone. Leave the two remote branches alone, or delete them remotely if the owner wants a tidy list.

**CONFIDENCE:** high.

**EVIDENCE**
- `git worktree list --porcelain` lists only the main checkout. `.worktrees/` does not exist, `.git/worktrees/` does not exist. The two names in the plan and in the task brief (`inventory-shipments`, `sales-stage-c`) are not registered anywhere.
- There are no local branches by those names. The remote ones: `origin/inventory-shipments` is 0 commits ahead of master (148 behind), `origin/sales-stage-c` is 0 ahead (110 behind). Both are fully contained in master, so nothing is lost. Same for `origin/books-pure-profit` (0 ahead) and `origin/employee-portal` (0 ahead).
- `git stash list` is empty.
- The current branch `rebuild/foundation` is 14 commits ahead of master (this is the live work, unrelated to the worktrees).

**WHAT WOULD CHANGE THE DECISION:** none. The earlier reading that two worktrees existed (plan Task 1 Step 4) is stale.

**NEXT ACTION:** Claude: tick Task 1 Step 4 (worktree part) as already done. Owner (optional, no urgency): `git push origin --delete inventory-shipments sales-stage-c` is safe (both 0 ahead). Not run.

---

## 5. Key rotation

**DECISION:** Rotate the Gmail app password and the Twilio auth token. Rotate Groq as well, because it costs almost nothing. Do the Groq key first and the Twilio token last, in one maintenance window, and update Vercel before revoking the old value.

**CONFIDENCE:** medium. The exposure is real but I cannot see where the terminal output went or what else it printed. See the first step below.

**EVIDENCE**
- `walk-findings.md:15,73,104`: the secrets were printed by a grep into a walk session terminal, and the dev server (and one Groq call) used the live keys. That is a transcript the tooling can retain, and anything printed into it should be treated as disclosed to wherever transcripts are stored. The repo cannot say where; so assume retained.
- `.gitignore:45` excludes `.env*` and no env file is in git history, so the repo itself did not leak them.
- Where each is used (what breaks when it changes): Gmail app password: `lib/2touch/poll-emails.ts` and `lib/email/poll-replies.ts` (the Z-report email fallback behind `/api/cron/2touch`, and rep replies) and `lib/reps/email.ts` (outgoing orders). Gmail grants mailbox read and send, so it is the most sensitive of the three. Twilio token: `lib/reps/sms.ts`, `lib/direct-deposit/sms.ts`, and `direct-deposit-service/app/sms.py` (a separate service, with its own config). Groq: the four `lib/ai-parsers/*` files (invoice, Z report, shift and inventory import). Per AGENTS.md the production values live in Vercel env, plus whatever the direct-deposit service host uses.
- Cost of rotating: no schema or data impact. Impact is only a short failure window if the Vercel value and the revoked value are out of step, and the Vercel deploy must finish before the old key is revoked. The one trap is Twilio: the direct-deposit service has its own copy, so rotate it there too or its SMS stops.
- The dev guard (`scripts/dev/live-guard.ts`, commit 96c4486) now prevents recurrence, but it does not undo the exposure.

**WHAT WOULD CHANGE THE DECISION:** if the session transcript is confirmed local-only and not retained or synced, Groq could be skipped and the other two deferred. In the other direction, if the grep also printed `SUPABASE_SERVICE_ROLE_KEY`, `DD_ENCRYPTION_KEY`, `CLOVER_*`, `CRON_SECRET` or `TWOTOUCH_INGEST_SECRET`, rotate those too. `DD_ENCRYPTION_KEY` needs a re-encryption plan first, because stored bank details depend on it, so do not rotate it blind.

**STEPS FOR THE OWNER (nothing was rotated)**
1. Find out exactly which lines the grep printed (scroll the walk terminal or the transcript). Add any extra secrets to this list.
2. Groq: create a new key in the Groq console, set `GROQ_API_KEY` in Vercel (Production) and in `.env.local`, redeploy, make one invoice read to confirm, then delete the old key.
3. Gmail: Google Account, Security, App passwords: create a new one, set `GMAIL_APP_PASSWORD` in Vercel and `.env.local`, redeploy, then trigger `/api/cron/2touch` once (with `CRON_SECRET`) to confirm the mailbox login works, then revoke the old app password. Check the account's recent security activity for anything unfamiliar.
4. Twilio: use the Twilio console's secondary auth token ("Request secondary token"), set `TWILIO_AUTH_TOKEN` in Vercel and in the direct-deposit service's environment, redeploy both, send one test SMS, then promote the secondary token to primary. That order gives zero downtime.
5. Keep the dev `.env.development.local` blank for these three so the guard stays quiet. The guard compares against the live file, so after step 2-4 update `.env.local` once.

**NEXT ACTION:** Owner: steps 1-5 (they need the Vercel, Google, Twilio and Groq consoles). Claude: cannot do these and should not.
