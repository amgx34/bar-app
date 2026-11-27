# Supabase migrations

Written for the owner. Nothing here has been run; items marked **OWNER TO CONFIRM** could not be verified from the repo.

## How a migration reaches dev and live

1. Install the CLI once: `brew install supabase/tap/supabase`.
2. Link the CLI to the **DEV project only**: `npm run supabase -- link --project-ref <dev-ref>`.
   Never link to live. The project refs are not recorded in the repo. **OWNER TO CONFIRM** both refs.
3. Always go through `npm run supabase -- <args>`, not a bare `supabase`. The wrapper
   (`scripts/dev/supabase.ts`, rules in `scripts/dev/supabase-guard.ts`) refuses `link`, `db push`,
   `db reset`, `db pull`, `migration up`/`repair` and any `--linked` or `--db-url` command when the target
   is the live project (the one in `.env.local`), or when it cannot tell which project it is.
   Read-only commands (`--version`, `migration list`, any `--dry-run`) always run. Set
   `SUPABASE_PROJECT_REF` or the dev `NEXT_PUBLIC_SUPABASE_URL` so the wrapper knows the target.
   The guard also reads the linked project from `supabase/.temp/project-ref`: a plain `db push` is judged
   by that ref, and is refused if it is live or differs from the env target. A bare `supabase` bypasses the guard.
4. Once, on dev: run `npm run supabase -- migration list`, compare it with what dev's database
   actually has, and repair history (`migration repair --status applied|reverted <version>`) until the two agree.
5. Before any push: `npm run supabase -- db push --dry-run`, read the list, then push to dev.
6. Live pushes are a manual human step (or CI behind an approval), after dev is verified.
   Override for that deliberate step only: `RAIL_ALLOW_LIVE_SUPABASE=1`. Agents never set it.
   How live migrations are applied today is **OWNER TO CONFIRM**.

## Legacy files

These 10 files in `supabase/migrations/` have no 14-digit timestamp prefix. The CLI skips or rejects
them, so `db push` will not apply them. They are left in place, unrenamed:

- `add_bar_messages.sql`
- `add_bar_messages_update.sql`
- `add_demo_requests.sql`
- `add_direct_deposit.sql`
- `add_pos_columns.sql`
- `add_reps.sql`
- `add_settings_fields.sql`
- `add_weigh_reports.sql`
- `ensure_full_schema.sql`
- `seed_sales_kingr5183.sql`

Whether their effects are already in dev and live is **OWNER TO CONFIRM**.

## This folder is not a full schema

The base org and membership tables were created outside this repo, so replaying `migrations/` on an empty
database will not work. `supabase/schema-export/baseline.sql` is the baseline export. Whether it is
complete and current is **OWNER TO CONFIRM**.
