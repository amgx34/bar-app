# Metrics sheet (G6)

For the founder, on Mondays. Seven numbers, defined exactly, with the read-only query or the hand-kept column that produces each. Every table and column below was checked against `supabase/schema-export/baseline.sql`, `supabase/migrations/20260901000001_add_payroll_runs.sql`, `lib/pos/pos-config.ts` and `lib/pos/sync-health.ts` on 2026-11-25. No query was run to write this. **There is no current number anywhere in this file: every sheet row is blank.** Every threshold is a HYPOTHESIS until ten bars have passed through (see "Revising the thresholds").

## Read this first

1. **Where to run.** Supabase dashboard, the **production Rail project**, SQL editor. Check the project name in the top-left before every paste. A staging or demo project returns plausible, wrong, numbers.
2. **Read-only.** Every query starts with `WITH` or `SELECT` and writes nothing. If a query ever contains `INSERT`, `UPDATE`, `DELETE`, `ALTER` or `DROP`, do not run it.
3. **Excluding demo and your own bar.** Each query keeps only organizations whose slug does not start with the demo prefix `demo-tipsy-tavern-` (`DEMO_SLUG_PREFIX` in `lib/demo/constants.ts`; if that constant ever changes, change it here too). Your own bar is not a pilot either: put its id in the `founder_bar` list where marked `TODO(owner)`. Leave the placeholder zero-uuid if you have not decided.
4. **Privacy and tenancy.** The queries span every organization, which the app itself never does (every in-app query is scoped to one bar). So they are run only by the owner, as administrator, in the Supabase editor. Never put them behind an app page, an API route or a shared dashboard. They return a short bar reference (the first 8 characters of the organization id), dates and counts: never bar names, employee names, pay, bank details, tips, emails or phone numbers. Do not copy personal data into the spreadsheet; if you must tell two bars apart, keep your own private key (bar reference to bar name) outside the sheet.
5. **What "pilot" means here.** The strategy's pilot is 30 nights from the first synced Z report. So a pilot starts at the first row in `z_report_days`, not when the account was created.

## The activation definition

A bar is **activated** when both are true:

1. **First Z report synced**: it has at least one row in `z_report_days`. The date is `MIN(z_report_days.created_at)` for that organization (insert time, so it is when the data first arrived, not the night it describes). Corroboration: `organizations.pos_config->>'last_sync_at'` is non-empty, but that field is overwritten every sync, so it shows "alive now", never "first".
2. **First pay run approved**: it has a row in `payroll_runs` with `status = 'approved'`. The date is `MIN(payroll_runs.reviewed_at)` over those rows. Status values that exist: `pending_approval`, `approved`, `changes_requested` (CHECK constraint in the migration).

Night 31 (the invoice night) is the first Z report's `report_date` plus 30 days. The pilot start date is derived, not stored.

## The seven metrics

Legend for the status line: RECORDED means a query answers it; NOT RECORDED TODAY means the database holds nothing and the sheet holds it by hand.

### 1. Conversations with 2Touch owners per week

- **Definition:** the number of conversations in the week, in person or by phone or message, with the owner of a bar that uses 2Touch, in which tips or payroll were discussed. Warm introductions and walk-ins only until counsel answers (see `outreach-rules-for-counsel.md`, G3).
- **Why it matters:** it is the top of everything. Without ten a week there is no one to pilot.
- **Kind:** leading.
- **Status: NOT RECORDED TODAY.** The database has no contact log. `demo_requests` records only people who filled in the website form (columns `business_name`, `inquiry_type`, `status`, `created_at`, `attribution`), which is a different, much smaller thing. Minimal change that would record it, **not proposed to build now**: nothing. A spreadsheet row per conversation is enough for ten customers.
- **Query:** none. Hand-kept.
- **Sheet columns:** week starting (Monday) | conversations held | of those, a 2Touch bar (yes/no count) | agreed to a pilot | asked for more info | said no | main reason for no (free text, no personal names).
- **HYPOTHESIS threshold:** 10 a week. Revise after ten bars: if the pilots that closed came from far fewer conversations, lower the target to what actually produced pilots.
- **Decision it triggers:** cumulative stop rule. Fewer than 5 pilots agreed from 20 conversations: the segment or the lead offer is wrong. Test Clover bars, or lead with stock instead of the close, before more conversations.

### 2. Pilots started

- **Definition:** count of non-demo, non-founder organizations whose first `z_report_days` row arrived in the week.
- **Why it matters:** the earliest proof that conversations turn into running software at a bar.
- **Kind:** leading.
- **Status:** RECORDED (query 1).
- **Sheet columns:** week starting | pilots started | cumulative pilots | conversations to date (from metric 1) | conversations per pilot.
- **HYPOTHESIS threshold:** 1 every two weeks.
- **Decision:** feeds the first stop rule (fewer than 5 from 20 conversations). Also sets the pacing: three pilots in days 31 to 60, pilots 4 to 6 in days 61 to 90, per the strategy.

### 3. Days from install to first synced Z report

- **Definition:** days between the organization being created and its first `z_report_days` row.
- **Why it matters:** a long gap means the agent install or the schema mapping went wrong, which is the exact failure `AGENTS.md` describes (a green strip over a feed that moves nothing).
- **Kind:** leading.
- **Status: PARTLY RECORDED.** The true install date (when the agent was put on the POS box) is **NOT RECORDED TODAY**; `pos_config.agent_seen_at` is overwritten on every sync so it is not a first-seen date. The proxy is `organizations.created_at`, which can be earlier than the visit. Minimal change that would record it, **not proposed to build now**: a first-seen timestamp written once. Until then, enter the visit date by hand in the sheet and use it in place of the query's proxy.
- **Sheet columns:** bar ref | visit date (hand) | org created (query) | first Z arrived (query) | days (visit to first Z) | note (what was wrong, if more than 1 day).
- **HYPOTHESIS threshold:** the same day.
- **Decision:** more than 3 days for two bars in a row: stop adding bars and walk the onboarding checklist (G5) for the cause before the next install.

### 4. Days from first Z report to first approved pay run (the activation gap)

- **Definition:** days between the first synced Z report and the first pay run with `status = 'approved'`.
- **Why it matters:** this is "activated". A bar that syncs but never approves a run has not received the product's central value.
- **Kind:** leading.
- **Status:** RECORDED (query 3).
- **Sheet columns:** bar ref | first Z arrived | first run submitted | first run approved | days to approved | reached approved within 14 days (yes/no) | blocker if no (free text).
- **HYPOTHESIS threshold:** 14 days or fewer.
- **Decision:** the second stop rule. Fewer than half of pilots reaching an approved run within 14 days: **stop adding bars and fix onboarding.** Below ten pilots, report counts, not percentages (for example "2 of 5").

### 5. Weekly active bars

- **Definition (the strategy's):** a bar is active in a week if a Z night was synced in the last 7 days AND a person submitted or approved a pay run, or saved a stock count, in the last 7 days.
- **What is observable:** a Z night in the last 7 days is `z_report_days.report_date`; a person submitted or approved is `payroll_runs.submitted_at` or `reviewed_at`; a stock count is `weigh_reports.created_at`. **Not observable:** other actions (tip rules edited, staff matched, reports viewed). No event log exists, so a bar that only reads its dashboards counts as inactive.
- **Why it matters:** it separates bars that use Rail from bars that merely have it installed.
- **Kind:** leading.
- **Status:** RECORDED, with the limit above (query 4). Run it on Mondays; it is a snapshot, so write the answer down each week, it cannot be recomputed for a past week from this query.
- **Sheet columns:** week starting | bars with a Z night in 7 days | bars also with a person action | paying bars (hand) | active share (count out of paying).
- **HYPOTHESIS threshold:** 4 of 5 paying bars.
- **Decision:** a bar with Z but no person action two weeks running gets a call, not an email. Two or more such bars: the product is installed but not used; go back to onboarding.

#### 5b. Weekly active owners (companion to metric 5)

- **Definition:** distinct owners (membership `role = 'owner'`) of non-demo bars whose `auth.users.last_sign_in_at` is within the last 7 days.
- **Limit:** `last_sign_in_at` is the time of the last fresh sign-in, not the last visit. A person whose phone stays signed in does not move it, so this **undercounts** and is a lower bound. Use it only beside metric 5, never alone. Reading `auth.users` needs the editor's administrator role; it is not available to the app's own client (query 5 returns counts only, no emails).
- **Sheet columns:** week starting | owners signed in (count) | owners total (count) | note.
- **HYPOTHESIS threshold:** none; learn the pattern first.

### 6. Pilot to paid

- **Definition:** of pilots that reached night 31, the count that paid the night-31 invoice without bargaining.
- **Why it matters:** the only direct test of willingness to pay.
- **Kind:** lagging.
- **Status: NOT RECORDED TODAY.** There is no plan, trial date, invoice or billing column anywhere in the schema (a search of the baseline for plan and trial finds nothing). Minimal change that would record it, **not proposed to build now**: nothing; the invoices are sent by hand, so the sheet is the record. Night 31 itself is computable (see activation definition).
- **Query:** none for payment. Use query 2 or 3 to get the first-Z date, then add 30 days.
- **Sheet columns:** bar ref | first Z report_date | night 31 date | invoice sent (date) | amount invoiced (TODO(owner), the price is a hypothesis) | paid (date or blank) | paid without bargaining (yes/no) | counter-offer made (free text, no names).
- **HYPOTHESIS threshold:** half of activated pilots. From the strategy: if 3 of the first 5 activated pilots pay without bargaining, the next price step stands; if fewer than 2 pay, the problem is value, not price, and the price is not cut. Report counts, not percentages, below ten.
- **Decision:** the price ladder, the public price and calling, decided only after three invoices have gone out (days 61 to 90).

### 7. Bars lost, with one reason

- **Definition:** a pilot or paying bar that stops syncing for good or asks to stop. One reason, picked from the fixed list below.
- **Why it matters:** the cheapest source of what to fix.
- **Kind:** lagging.
- **Status: NOT RECORDED TODAY.** No cancellation, closure or churn-reason column exists. Minimal change that would record it, **not proposed to build now**: nothing. Hand-kept. Query 6 (stale sync) shows the early warning but cannot tell "closed for the winter" from "gone".
- **Fixed reason list** (pick exactly one; add a free-text note only if none fits, then add a reason at the next review):
  1. Price
  2. Never got the install working
  3. The numbers were wrong (a tips or pay figure the owner disagreed with)
  4. Not needed (does payroll another way, no change in habit)
  5. POS changed or the bar closed
  6. Wanted a feature not built
  7. No response (stopped answering)
  8. Other (note)
- **Sheet columns:** bar ref | date lost | days since first Z | reason (1 to 8 from the list) | last contact date | what would have kept them (free text).
- **HYPOTHESIS threshold:** none. Learn, no target.
- **Decision:** a reason that appears twice among the first ten gets a fix before the next pilot is started. "The numbers were wrong" once is a stop: fix, tell the other pilots, then continue (the target for wrong money figures a customer finds is zero).

## The six read-only queries

All six keep the same two exclusions, written out each time so each can be pasted alone. In each, replace the zero-uuid in `founder_bar` only if you have decided to (`TODO(owner)`).

### Query 1: pilots started per week (metric 2)

```sql
-- READ-ONLY. Run in the production Rail project's SQL editor.
WITH real_orgs AS (
  SELECT id
  FROM organizations
  WHERE slug NOT LIKE 'demo-tipsy-tavern-%'
    AND id NOT IN ('00000000-0000-0000-0000-000000000000') -- TODO(owner): founder's own bar id
),
first_z AS (
  SELECT z.organization_id, MIN(z.created_at) AS first_z_at
  FROM z_report_days z
  JOIN real_orgs r ON r.id = z.organization_id
  GROUP BY z.organization_id
)
SELECT date_trunc('week', first_z_at)::date AS week_starting,
       COUNT(*)                              AS pilots_started
FROM first_z
GROUP BY 1
ORDER BY 1;
```

### Query 2: install to first synced Z report (metric 3)

```sql
-- READ-ONLY. org created_at is a PROXY for install date; enter the real visit date by hand.
WITH real_orgs AS (
  SELECT id, created_at
  FROM organizations
  WHERE slug NOT LIKE 'demo-tipsy-tavern-%'
    AND id NOT IN ('00000000-0000-0000-0000-000000000000') -- TODO(owner): founder's own bar id
),
first_z AS (
  SELECT z.organization_id,
         MIN(z.created_at)  AS first_z_at,
         MIN(z.report_date) AS first_report_date
  FROM z_report_days z
  GROUP BY z.organization_id
)
SELECT left(r.id::text, 8)                                     AS bar_ref,
       r.created_at::date                                      AS org_created,
       f.first_z_at::date                                      AS first_z_arrived,
       f.first_report_date                                     AS first_report_date,
       (f.first_report_date + 30)                              AS night_31,
       ROUND(EXTRACT(EPOCH FROM (f.first_z_at - r.created_at)) / 86400.0, 1) AS days_created_to_first_z
FROM real_orgs r
LEFT JOIN first_z f ON f.organization_id = r.id
ORDER BY r.created_at;
```

A blank `first_z_arrived` means the bar has an account but no Z data yet. That is information, not an error.

### Query 3: activation, first Z to first approved pay run (metric 4)

```sql
-- READ-ONLY. Activated = a first Z row exists AND an approved pay run exists.
WITH real_orgs AS (
  SELECT id
  FROM organizations
  WHERE slug NOT LIKE 'demo-tipsy-tavern-%'
    AND id NOT IN ('00000000-0000-0000-0000-000000000000') -- TODO(owner): founder's own bar id
),
first_z AS (
  SELECT organization_id, MIN(created_at) AS first_z_at
  FROM z_report_days
  GROUP BY organization_id
),
runs AS (
  SELECT organization_id,
         MIN(submitted_at)                                       AS first_submitted_at,
         MIN(reviewed_at) FILTER (WHERE status = 'approved')     AS first_approved_at
  FROM payroll_runs
  GROUP BY organization_id
)
SELECT left(r.id::text, 8)                                  AS bar_ref,
       f.first_z_at::date                                   AS first_z_arrived,
       ru.first_submitted_at::date                          AS first_run_submitted,
       ru.first_approved_at::date                           AS first_run_approved,
       ROUND(EXTRACT(EPOCH FROM (ru.first_approved_at - f.first_z_at)) / 86400.0, 1) AS days_first_z_to_approved,
       (ru.first_approved_at IS NOT NULL
        AND ru.first_approved_at <= f.first_z_at + interval '14 days') AS approved_within_14_days,
       (f.first_z_at IS NOT NULL AND ru.first_approved_at IS NOT NULL)  AS activated
FROM real_orgs r
LEFT JOIN first_z f ON f.organization_id = r.id
LEFT JOIN runs ru   ON ru.organization_id = r.id
ORDER BY f.first_z_at;
```

Caveats. `approved_within_14_days` is false for a bar still inside its 14 days; do not count a bar against the stop rule until 14 days have passed since its first Z. `reviewed_at` is also set on a send-back, which is why it is filtered by `status = 'approved'`. A run later approved after changes shows the approval time of the current row.

### Query 4: weekly active bars (metric 5)

```sql
-- READ-ONLY. A snapshot for "now"; write the result into the sheet the same day.
WITH real_orgs AS (
  SELECT id
  FROM organizations
  WHERE slug NOT LIKE 'demo-tipsy-tavern-%'
    AND id NOT IN ('00000000-0000-0000-0000-000000000000') -- TODO(owner): founder's own bar id
),
z_recent AS (
  SELECT DISTINCT organization_id
  FROM z_report_days
  WHERE report_date >= current_date - 7
),
person_recent AS (
  SELECT organization_id FROM payroll_runs
   WHERE submitted_at >= now() - interval '7 days'
      OR reviewed_at  >= now() - interval '7 days'
  UNION
  SELECT organization_id FROM weigh_reports
   WHERE created_at >= now() - interval '7 days'
)
SELECT left(r.id::text, 8)                         AS bar_ref,
       (r.id IN (SELECT organization_id FROM z_recent))      AS z_night_in_7_days,
       (r.id IN (SELECT organization_id FROM person_recent)) AS person_action_in_7_days,
       (r.id IN (SELECT organization_id FROM z_recent)
        AND r.id IN (SELECT organization_id FROM person_recent)) AS active
FROM real_orgs r
ORDER BY active DESC, bar_ref;
```

### Query 5: weekly active owners by sign-in (metric 5b)

```sql
-- READ-ONLY. Counts only; no emails. Needs the editor's administrator role (reads auth.users).
-- Lower bound: last_sign_in_at is the last FRESH sign-in, not the last visit.
WITH real_orgs AS (
  SELECT id
  FROM organizations
  WHERE slug NOT LIKE 'demo-tipsy-tavern-%'
    AND id NOT IN ('00000000-0000-0000-0000-000000000000') -- TODO(owner): founder's own bar id
)
SELECT COUNT(DISTINCT m.user_id)                                                       AS owners_total,
       COUNT(DISTINCT m.user_id) FILTER (WHERE u.last_sign_in_at >= now() - interval '7 days') AS owners_signed_in_7d
FROM memberships m
JOIN real_orgs r ON r.id = m.organization_id
JOIN auth.users u ON u.id = m.user_id
WHERE m.role = 'owner';
```

### Query 6: bars whose sync is stale or brought nothing back (the watch item)

```sql
-- READ-ONLY. Mirrors lib/pos/sync-health.ts: warns after 60 minutes of silence,
-- alarms after 12 hours; "no_data" = checked in, no errors, all three feeds counted zero.
-- An ABSENT last_sync_summary means "cannot say" (old agent), never "moved nothing".
WITH real_orgs AS (
  SELECT id, pos_config
  FROM organizations
  WHERE slug NOT LIKE 'demo-tipsy-tavern-%'
    AND id NOT IN ('00000000-0000-0000-0000-000000000000') -- TODO(owner): founder's own bar id
    AND pos_config ? 'agent_token'
)
SELECT left(id::text, 8)                                        AS bar_ref,
       (pos_config->>'agent_version')                           AS agent_version,
       (pos_config->>'last_sync_at')::timestamptz               AS last_sync_at,
       ROUND(EXTRACT(EPOCH FROM (now() - (pos_config->>'last_sync_at')::timestamptz)) / 60) AS minutes_silent,
       CASE WHEN jsonb_typeof(pos_config->'last_sync_errors') = 'array'
            THEN jsonb_array_length(pos_config->'last_sync_errors') END AS error_count,
       (pos_config->'last_sync_summary'->>'zReports')           AS z_reports_last_sync,
       (pos_config->'last_sync_summary'->>'ewReports')          AS ew_reports_last_sync,
       (pos_config->'last_sync_summary'->>'itemAudit')          AS item_audit_last_sync
FROM real_orgs
ORDER BY minutes_silent DESC NULLS FIRST;
```

Read it as: `minutes_silent` over 60 is amber, over 720 is red; `error_count` above 0 outranks silence; all three `*_last_sync` equal to 0 with `error_count` 0 is the `no-data` case. A bar closed for two days looks the same as a dead feed here, so phone before concluding. The query returns the error count only, never the error text, because that text can name items.

## Spreadsheet layout

One workbook, four tabs. Blank until the owner fills it in.

| Tab | Columns |
|---|---|
| **Weekly** (one row per Monday) | week starting | conversations (metric 1) | pilots started (Q1) | paying bars (hand) | active bars (Q4) | active share, as a count out of paying (Q4) | owners signed in / total (Q5) | stale or no-data bars (Q6) | wrong money figures found by a customer (hand; target zero) | note |
| **Pilots** (one row per bar) | bar ref | visit date (hand) | first Z arrived (Q2) | first run approved (Q3) | days first Z to approved | within 14 days (yes/no) | night 31 | invoice sent | paid without bargaining (yes/no) | status (pilot / paying / lost) |
| **Conversations** (one row per conversation, no personal names) | date | channel (in person / phone / introduction) | 2Touch bar (yes/no) | outcome (pilot / more info / no) | reason if no | the four price answers if asked (cheap enough to doubt, a bargain, getting expensive, too expensive) |
| **Lost** | bar ref | date lost | reason code (1 to 8) | note |

Keep the bar ref as the only identifier. Do not paste employee names, emails, phone numbers, pay or tip figures anywhere in the workbook.

## What is not measured, and why

- **Contact and conversation counts, trial and plan dates, payment, churn reasons:** no table holds them. Ten customers fit in a spreadsheet; building a billing or events system now is explicitly deferred.
- **Page views and demo requests:** page views live in Vercel Analytics with no custom events. `demo_requests` (with `attribution` jsonb holding the UTM keys `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` as captured by `lib/utm.ts`) records website enquiries and is not one of the seven because it is not a pilot signal; it can be read on its own in the editor.
- **Feature use inside the app** (reports viewed, tip rules edited): no event log exists, so weekly active bars understates a bar that only looks at its dashboards.
- **True install date, and the agent's first-seen time:** see metric 3.
- **Money accuracy:** a wrong tips or pay figure is found only by a customer telling you; it is counted by hand in the Weekly tab.

## Revising the thresholds

Every threshold above is a HYPOTHESIS: a belief with no data behind it. After the first ten bars:

1. Replace each guess with the median of what the ten actually did (for days to first Z, days to approved run, conversations per pilot). Write the median and the range beside the old guess; do not delete the guess.
2. If fewer than ten bars exist by day 90, keep the counts and say "n of m". Do not invent a percentage.
3. Keep the two stop rules as written until a pattern from ten bars gives a reason to move them. If you change one, write down why and the date.

## Decisions at a glance

| Observation | Action |
|---|---|
| Fewer than 5 pilots agreed from 20 conversations | The segment or the lead offer is wrong. Try Clover bars or lead with stock instead of the close. |
| Fewer than half of pilots reach an approved pay run within 14 days of first Z | Stop adding bars. Fix onboarding (G5) first. |
| 3 of the first 5 activated pilots pay at night 31 without bargaining | The next price step stands. |
| Fewer than 2 of the first 5 activated pilots pay | The problem is value, not price. Do not cut the price. |
| A bar with Z but no person action for two weeks | Phone the owner. |
| A bar in query 6 amber or red | Phone first; a closed bar looks the same as a dead feed. |
| Same loss reason twice in the first ten | Fix it before the next pilot. |
| Any wrong money figure found by a customer | Stop, fix, tell the other pilots. |

## The weekly 20-minute review (Mondays)

| Minutes | Step |
|---|---|
| 0 to 3 | Open the production Rail project in the Supabase SQL editor. Confirm the project name. |
| 3 to 9 | Paste queries 1, 3, 4 and 5 in turn. Copy the numbers (counts and dates, no names) into the Weekly and Pilots tabs. |
| 9 to 12 | Paste query 6. For every amber or red bar, add a "phone this bar" line to the week's list. |
| 12 to 15 | Fill in the by-hand cells: conversations held, paying bars, wrong money figures found, any bar lost with its reason code. |
| 15 to 18 | Apply the table above. Write one line: what the numbers say to do this week. |
| 18 to 20 | Check each pilot's 14-day clock and night 31 date; list invoices due this week. Close the editor. |

## Unverified

- Whether `payroll_runs.reviewed_at` is set only by approval and send-back and never touched by later edits: read from the migration's column list and `AGENTS.md`, not from the action code. UNVERIFIED.
- Whether `z_report_days.created_at` is stamped only on first insert (so it is a true first-arrival time) rather than reset by an upsert. The column has a default of `CURRENT_TIMESTAMP` and the agent's two-day window re-sends rows, so confirm on live before relying on query 1 to 3. UNVERIFIED.
- Whether the SQL editor's role can read `auth.users` on the owner's plan and project: usually, but not tested. UNVERIFIED.
- That `pos_config->>'last_sync_at'` is stored as an ISO-8601 string that casts to `timestamptz`: `lib/pos/pos-config.ts` writes `now` as a string; the format was not checked. UNVERIFIED.
- Every threshold in this file is a HYPOTHESIS; none has been tested.

## Sources

- `docs/go-to-market/strategy.md`, section 7 (the numbers, stop rules), read 2026-11-25.
- `docs/superpowers/findings/2026-11-25-gtm-manager-plan.md`, item G6 and the guardrails, read 2026-11-25.
- `supabase/schema-export/baseline.sql` (`organizations`, `memberships`, `z_report_days`, `payroll_runs`, `weigh_reports`, `demo_requests`).
- `supabase/migrations/20260901000001_add_payroll_runs.sql` (status values).
- `lib/pos/pos-config.ts`, `lib/pos/sync-health.ts` (field names, thresholds).
- `lib/demo/constants.ts` (`DEMO_SLUG_PREFIX`), `lib/utm.ts` (attribution keys).
- `AGENTS.md` (sync-health and pay-run notes).
