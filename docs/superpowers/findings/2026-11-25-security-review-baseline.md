# Security review of the schema baseline — 2026-11-25

An automated review of commit c218a98 flagged five issues in
`supabase/schema-export/baseline.sql`. `baseline.sql` is a faithful copy of the
**live** schema, so none of these were introduced by the commit; they describe
what production already has. The baseline is deliberately NOT edited to hide them:
a dev database that differs from live would let the walkthrough pass on a bug
production still has. Fixes go in a migration (Plan 1, Task 10), after the owner
confirms the grants below.

What the export cannot show: **table and function grants** (`GRANT`/`REVOKE`).
Every verdict below that says "depends on grants" is open until the query at the
bottom is run against the live project.

## 1. RLS is off on six tables — REAL, severity depends on grants

`direct_deposit_accounts`, `dd_verification_codes`, `dd_audit_log`, `audit_log`,
`platform_admins`, `sales` have `relrowsecurity = false` and no policies.

- For the three `dd_*` tables the repo says the opposite: `ensure_full_schema.sql`
  lines 413-415 enable RLS. **That script was never applied to live**, or was
  undone. This is migration drift, not a design choice.
- `direct_deposit_accounts` holds encrypted routing/account numbers and consent
  text; `dd_verification_codes` holds salted code hashes; `platform_admins` lists
  who can see every bar's inventory (`is_platform_admin()` policy).
- Supabase grants `anon` and `authenticated` access to new `public` tables by
  default, and the anon key ships in the browser bundle. If those grants are
  intact, these tables are readable and writable through the public API with no
  login. If they were revoked, the missing RLS is defence in depth only.
- App code reaches these tables through `createAdminClient()` (service role,
  bypasses RLS), so enabling RLS with no policies will not break the app.

**Fix (after grants are confirmed):** one migration that enables RLS on all six,
revokes `anon`/`authenticated` on `direct_deposit_accounts`, `dd_verification_codes`,
`dd_audit_log`, `platform_admins`, and adds org-scoped read policies for `sales`
and `audit_log` only if a page reads them with the cookie client (check first).
The reviewer's suggested `user_org_ids()` policies for the `dd_*` tables are not
needed: no client-side code should ever read bank data.

## 2-5. SECURITY DEFINER functions — NOT EXPLOITABLE as designed, confirm on live

`dd_commit_account`, `dd_delete_account`, `pos_apply_item_sales`,
`prune_jsonb_payloads`, `rate_limit_hit`, `rate_limit_sweep`.

The reviewer saw function bodies without grants, and Postgres grants `EXECUTE` to
everyone by default, so it assumed any caller could invoke them. The repo's
migrations close that:

| function | migration | grant |
|---|---|---|
| `rate_limit_hit`, `rate_limit_sweep` | 20260817000000 | `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO service_role` |
| `dd_commit_account`, `dd_delete_account`, `prune_jsonb_payloads` | 20260817000001 | same |
| `pos_apply_item_sales` | 20260817000003, re-applied in 20260817000007 | also `FROM anon, authenticated` |

Every call site uses the admin client (`direct-deposit-actions.ts:241,373`,
`api/2touch/ingest/route.ts:703`, `api/cron/2touch/route.ts:37,54`,
`lib/rate-limit.ts:70`). The org check inside the functions
(`v_code_org <> p_org_id`) is the second layer for a caller who already holds
the service role, which is the only caller there is.

Two observations worth keeping even if grants are correct:

- `dd_commit_account` / `dd_delete_account` do not check `is_used`, `expires_at`,
  `attempts` or `action` themselves; the TypeScript caller does. Moving those
  checks into the function would make the money-adjacent path safe without
  relying on every caller. Logged as a hardening item for Plan 4, not a bug.
- `prune_jsonb_payloads` has no retention floor; `p_audit_retain_days => 0`
  would strip all audit history. Only the cron route calls it, with defaults.

## Query to confirm (read-only, run on the LIVE project)

```sql
-- 1. Can the public API reach the six unprotected tables?
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
  and table_name in ('direct_deposit_accounts','dd_verification_codes','dd_audit_log',
                     'audit_log','platform_admins','sales')
order by 1, 2, 3;

-- 2. Can the public API call the SECURITY DEFINER functions?
select p.proname, r.rolname as grantee
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join pg_roles r
where n.nspname = 'public' and p.prosecdef
  and r.rolname in ('anon','authenticated')
  and has_function_privilege(r.oid, p.oid, 'EXECUTE')
order by 1, 2;
```

Expected if everything is as the migrations intend: query 2 returns only
`is_platform_admin`, `user_org_ids`, `user_role_in` (the RLS helpers, which are
meant to be callable) and `create_organization` (signed-in users create their own
bar). Anything else in query 2 is a finding. Any row in query 1 is a P0.
