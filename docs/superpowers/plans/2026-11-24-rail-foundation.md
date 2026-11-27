# Rail Foundation Implementation Plan (Plan 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the agreed tooling, get the test suite running, build a safe copy of the database, and walk every screen to produce a list of broken features, all without touching live data.

**Architecture:** Environment work (plugins, Graphify) is scripted and verified by reading files back. Everything with logic (schema export converter, dev-environment guard, route inventory) is a small pure function with a vitest test. The live database is never contacted: it is described by a read-only query the owner runs by hand, and rebuilt in a separate Supabase project.

**Tech Stack:** Next.js 16, Supabase, vitest 4 (config `vitest.config.mts`), papaparse (already a dependency), Node 24 (runs `.ts` scripts directly), Playwright MCP for the walkthrough, Python pip for Graphify.

**Spec:** `docs/superpowers/specs/2026-11-24-rail-rebuild-design.md`

**This is Plan 1.** The spec covers five independent pieces of work. Later plans are written after this one, because they depend on its findings: **2** audit, competitor matrix, design system and five-destination navigation; **3** animated front page; **4** app simplification and the packages table; **5** go-to-market pack and launch video.

## Global Constraints

- Treat the database behind `.env.local` as live. No screen walkthrough, seed, or write runs against it. Nothing in this plan opens a connection to it.
- No commits or pushes unless the owner says to. Each task ends with a **Checkpoint**: stage the listed files and show `git diff --stat`; commit only if the owner has authorized commits.
- Work on a new branch `rebuild/foundation`, created from `feat/payroll-tax-withholding`.
- Read `node_modules/next/dist/docs/` before writing any Next.js code. UI is Base UI, not Radix. Follow `AGENTS.md` invariants.
- `npm run audit:scope` must stay green. Money functions in `lib/` are never edited to satisfy a test (see Task 2).
- Install tools from official sources only: `DietrichGebert/ponytail`, `Graphify-Labs/graphify` (PyPI name `graphifyy`), `affaan-m/ECC`, `pbakaus/impeccable`, `Nutlope/hallmark`, `latent-spaces/brag`. ECC is enabled for this project only.
- No `claude` CLI on this machine: plugin config is edited by script, with backups first. New skills appear after a session restart.
- Anything only the owner can provide is marked **OWNER ACTION**. Do not invent it.

## Review Focus

- **Reserved-word and mixed-case identifiers** (a table named `order`, a column named `user`, `"Org"`): converter must quote every identifier. Tested in Task 5.
- **Defaults that call functions, and foreign-key cycles**: functions must exist before tables, and foreign keys come after all tables. Tested in Task 5.
- **Export arrives in an unknown shape** (CSV or JSON, payload as a string, an empty section such as no triggers): loader accepts all of them. Tested in Task 5.
- **Dev guard fooled by formatting** (trailing slash, upper-case host, `http` versus `https`, missing `.env.local`): compare normalized hosts. Tested in Task 6.
- **Routes that are not plain pages** (`[id]`, `[...slug]`, `(group)`, `_private`, `@slot`, `route.ts`): inventory classifies each. Tested in Task 8.

---

### Task 1: Install the tooling

**Files:**
- Create (outside the repo): `C:\Users\notug\AppData\Local\Temp\claude\7bb064eab9ca97eb\86105807-bf31-40c8-801e-6b24933b8f14\scratchpad\install-plugins.mjs`
- Create: `docs/superpowers/findings/2026-11-24-tooling-audit.md`
- Modify (by script): `~/.claude/plugins/installed_plugins.json`, `~/.claude/plugins/known_marketplaces.json`, `~/.claude/settings.json`
- Create: `.claude/settings.local.json` (ECC only)

**Interfaces:**
- Produces: the tools installed and recorded; `graphify` on PATH. Later tasks use `graphify` (Task 7).

- [ ] **Step 0: Create the branch** `rebuild/foundation` from `feat/payroll-tax-withholding`. The tracked `obj/` build files already showing as modified come along; leave them alone.
- [ ] **Step 1: Back up config.** Copy the three JSON files to `<name>.bak-2026-11-24` next to the originals. Verify each backup parses with `node -e "JSON.parse(require('fs').readFileSync(p))"`.
- [ ] **Step 2: Clone each marketplace** with `git clone --depth 1` from `https://github.com/<owner>/<repo>` into `~/.claude/plugins/marketplaces/<repo>`. Record `git rev-parse HEAD` for each in the audit note. Stop if a repo's owner or name differs from the list in Global Constraints.
- [ ] **Step 3: Audit before enabling.** For each plugin read `.claude-plugin/marketplace.json`, `plugin.json`, every `hooks.json`, and every script a hook runs. In the audit note write, per plugin: hooks (event and command), network calls, files written outside the project, anything that runs on every prompt. **If any hook sends data off the machine or writes outside the project, stop and report to the owner before Step 4.**
- [ ] **Step 4: Register the plugins.** Write `install-plugins.mjs`: copy each plugin (respecting `source` in its marketplace manifest, excluding `.git`) to `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`; add an entry to `installed_plugins.json` matching the shape of existing entries (`scope: "user"`, `installPath`, `version`, `installedAt`, `lastUpdated`, `gitCommitSha`); add the marketplace to `known_marketplaces.json` matching existing entries; set `enabledPlugins["<plugin>@<marketplace>"] = true` for ponytail, impeccable, hallmark, brag. For ECC set it to `false` in `~/.claude/settings.json` and `true` in the repo's `.claude/settings.local.json`. Re-parse every file after writing.
- [ ] **Step 5: Install Graphify.** Open `https://pypi.org/project/graphifyy/` and confirm its homepage is `Graphify-Labs/graphify`. Run `pip install graphifyy`, then `graphify install`. **Do not run `graphify claude install`**: it edits the checked-in `CLAUDE.md` and adds a hook, and needs the owner's say-so.
- [ ] **Step 6: Verify.** Run `graphify --help` (expect usage text, exit 0). For each plugin confirm a `SKILL.md` exists under its cache path. Add `graphify-out/` to `.gitignore`.
- [ ] **Checkpoint:** stage `.gitignore` and the audit note.

---

### Task 2: Make the test suite load

**Files:**
- Modify: `package.json`, `vitest.config.mts` (only what the cause requires)

**Interfaces:**
- Produces: `npm test` loads all 54 test files. Task 4 relies on this.

- [ ] **Step 1: Reproduce.** Run `npx vitest run lib/payroll/tax/tables`. Expected today: both files FAIL with `TypeError: Cannot read properties of undefined (reading 'config')`. This is the failing test for the whole task.
- [ ] **Step 2: Find the cause.** Check in order: `npm ls vitest vite` for duplicate copies; `npm view vitest@4.1.11 peerDependencies` against installed vite 8.2.1; whether `resolve.tsconfigPaths: true` in `vitest.config.mts` changes how `vitest` itself resolves (remove it temporarily and rerun). Write the cause in one line in the findings file.
- [ ] **Step 3: Fix the cause** with the smallest change (version pin or upgrade, or config). Run `npx vitest run lib/payroll/tax/tables`. Expected: PASS.
- [ ] **Step 4: Run the whole suite** with `npm test`. Expected: every file loads. Triage any red test as **money** (anything under `lib/payroll`, `lib/pos`, `lib/books`, tips, tax) or **other**.
- [ ] **Step 5: Money failures stop the work.** For each failing money test, write a finding with the test name, expected and actual values, and which side looks wrong, then **ask the owner**. Never edit an expectation to match the code. Fix **other** failures one at a time.
- [ ] **Checkpoint:** stage the changed config files and the findings.

---

### Task 3: Baseline gates and stale worktrees

**Files:**
- Create: `docs/superpowers/findings/2026-11-24-baseline.md`

- [ ] **Step 1: Confirm the branch** is `rebuild/foundation` (created in Task 1).
- [ ] **Step 2: Run and record** `npx tsc --noEmit`, `npm run lint`, `npm run audit:scope`, `npm test`, `npm run build`. For each write command, exit code and error count. Expected today: tsc clean; the rest unknown.
- [ ] **Step 3: Stale worktrees.** `git worktree list` shows `inventory-shipments` and `sales-stage-c`, both 0 commits ahead of master. For each run `git -C .worktrees/<name> status --short`. **Ask the owner** before `git worktree remove`; remove only the ones whose status is empty.
- [ ] **Checkpoint:** stage the baseline note.

---

### Task 4: Schema export query

**Files:**
- Create: `supabase/diagnostics/export-schema.sql`
- Create: `scripts/schema/export-schema.test.ts`
- Modify: `vitest.config.mts` (add `'scripts/**/*.test.ts'` to `test.include`)

**Interfaces:**
- Produces: a query returning rows `(section text, payload jsonb)` with sections `enums`, `tables`, `columns`, `constraints`, `indexes`, `policies`, `functions`, `triggers`. Each payload is a JSON array whose items are the section types defined in Task 5 (`SchemaExport`). Schema `public` only; structure only, no row data.

- [ ] **Step 1: Write the failing test** `export-schema.test.ts`: `it('is read-only')` reads the SQL file, strips `--` comments and `/* */` blocks, and asserts the text matches none of `/\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|call|do)\b/i`; `it('returns one row per section')` asserts the file mentions each of the eight section names; `it('names no data tables')` asserts it never selects from a `public.` table directly.
- [ ] **Step 2: Run** `npx vitest run scripts/schema` and confirm FAIL (file missing).
- [ ] **Step 3: Write the query.** Follow the style of the existing files in `supabase/diagnostics/`. Use `pg_catalog` and `information_schema`; take definitions from `pg_get_constraintdef`, `pg_get_indexdef` (skip indexes that back a constraint), `pg_get_functiondef` (public schema, not extension-owned), `pg_get_triggerdef` (not internal), `format_type` for columns, and `pg_policies` for policies and `pg_class.relrowsecurity` for RLS. One `UNION ALL` of eight `SELECT`s, each wrapping its rows with `jsonb_agg`.
- [ ] **Step 4: Run the test** and confirm PASS.
- [ ] **Step 5: OWNER ACTION.** The owner pastes the file into the Supabase SQL editor of the project in `.env.local`, then saves the result (download CSV, or copy as JSON) to `supabase/schema-export/live-export.csv` (or `.json`). The owner reads it once before it is committed: it holds structure only (table and policy names, function bodies) and no rows.
- [ ] **Checkpoint:** stage the three files. Stage the export only after the owner has read it.

---

### Task 5: Turn the export into a baseline migration

**Files:**
- Create: `scripts/schema/schema-to-sql.ts`
- Create: `scripts/schema/schema-to-sql.test.ts`
- Create: `scripts/schema/build-baseline.ts` (CLI: reads the export, writes `supabase/schema-export/baseline.sql`)
- Test fixture: built inline in the test file

**Interfaces:**
- Produces, in `schema-to-sql.ts`:
  - `type SchemaExport = { enums: {name: string; labels: string[]}[]; tables: {name: string; rls: boolean}[]; columns: {table: string; name: string; position: number; type: string; notNull: boolean; default: string | null; identity: 'always' | 'by default' | null; generated: string | null}[]; constraints: {table: string; name: string; kind: 'p'|'u'|'f'|'c'; definition: string}[]; indexes: {table: string; name: string; definition: string}[]; policies: {table: string; name: string; permissive: boolean; command: 'ALL'|'SELECT'|'INSERT'|'UPDATE'|'DELETE'; roles: string[]; using: string | null; check: string | null}[]; functions: {name: string; definition: string}[]; triggers: {table: string; name: string; definition: string}[] }`
  - `function quoteIdent(name: string): string`
  - `function loadExport(raw: string): SchemaExport`: accepts CSV text with header `section,payload`, or a JSON array of `{section, payload}`; `payload` may be a JSON string or an already-parsed array; a missing section becomes `[]`.
  - `function schemaToSql(s: SchemaExport): string`

- [ ] **Step 1: Write failing tests** in `schema-to-sql.test.ts`:
  - `quoteIdent('order')` is `"order"`; `quoteIdent('a"b')` is `"a""b"`.
  - `loadExport` gives the same result for a CSV input and a JSON-array input of the same data, and returns `triggers: []` when that section is absent.
  - `schemaToSql` on a fixture with a table `orders` (column `id uuid not null default gen_random_uuid()`, column `org_id`), a table `organizations`, a foreign key from `orders.org_id`, a function used as a column default, one trigger, one policy: the output contains these in this order, by `indexOf`: `set check_function_bodies = off`, `CREATE FUNCTION`, `CREATE TABLE`, `FOREIGN KEY`, `CREATE TRIGGER`, `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`.
  - A fixture where table `a` has a foreign key to `b` and `b` to `a` produces both `CREATE TABLE`s before either `FOREIGN KEY`.
  - A policy with `roles: ['authenticated']`, `using: "(organization_id = current_org_id())"`, `check: null` renders `CREATE POLICY "name" ON "public"."t" AS PERMISSIVE FOR SELECT TO authenticated USING ((organization_id = current_org_id()));` with no `WITH CHECK`; a policy with `roles: ['public']` renders `TO public`.
  - Function definitions appear byte-for-byte in the output.
  - A table named `order` is emitted as `CREATE TABLE "public"."order"`.
  - A column with `identity: 'always'` renders `GENERATED ALWAYS AS IDENTITY`; one with `generated: '(a + b)'` renders `GENERATED ALWAYS AS ((a + b)) STORED`.
- [ ] **Step 2: Run** `npx vitest run scripts/schema/schema-to-sql` and confirm FAIL.
- [ ] **Step 3: Implement** the three functions. Columns are emitted in `position` order; primary-key, unique and check constraints are added inside or right after their table, foreign keys last; `schemaToSql` ends with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for each table with `rls: true`.
- [ ] **Step 4: Run the tests** and confirm PASS.
- [ ] **Step 5: Implement `build-baseline.ts`**: `node scripts/schema/build-baseline.ts <export-file>` writes `supabase/schema-export/baseline.sql` and prints table, policy and function counts. Run it on the real export once it exists and compare the table count with the count of `CREATE TABLE` in the output.
- [ ] **Checkpoint:** stage the three scripts; stage `baseline.sql` after the owner has read it.

---

### Task 6: Dev environment guard and dev project

**Files:**
- Create: `scripts/dev/live-guard.ts`, `scripts/dev/live-guard.test.ts`, `scripts/dev/check-dev-env.ts`
- Modify: `package.json` (add `"predev": "node scripts/dev/check-dev-env.ts"`)

**Interfaces:**
- Produces, in `live-guard.ts`: `function normalizeHost(url: string): string` (lower-case host only, no scheme, port, path or trailing slash); `function readEnvValue(text: string, key: string): string | undefined` (ignores comments, strips quotes); `function assertDevIsNotLive(devUrl: string | undefined, liveUrl: string | undefined, allowLive: boolean): void` (throws if `devUrl` is missing, or if its normalized host equals `liveUrl`'s and `allowLive` is false).

- [ ] **Step 1: Write failing tests:** `normalizeHost('HTTPS://AbC.supabase.co/')` is `abc.supabase.co`; `readEnvValue('A=1\n# B=2\nC="x y"', 'C')` is `x y` and `'B'` is `undefined`; `assertDevIsNotLive` throws when dev and live differ only by case and trailing slash; does not throw when hosts differ; does not throw when `liveUrl` is undefined and `devUrl` is set; throws when `devUrl` is undefined; does not throw when hosts match and `allowLive` is true.
- [ ] **Step 2: Run** `npx vitest run scripts/dev` and confirm FAIL.
- [ ] **Step 3: Implement** the three functions, then `check-dev-env.ts`: load env with `loadEnvConfig` from `@next/env` in dev mode for `devUrl`, read `NEXT_PUBLIC_SUPABASE_URL` from the raw `.env.local` file for `liveUrl`, read `RAIL_ALLOW_LIVE_DEV === '1'` for `allowLive`; print which host dev will use and exit 1 with a clear message on failure.
- [ ] **Step 4: Run the tests** and confirm PASS. Run `npm run dev` with only `.env.local` present; expected: it refuses to start with the guard message.
- [ ] **Step 5: OWNER ACTION.** The owner creates a new, empty Supabase project, runs `supabase/schema-export/baseline.sql` in its SQL editor, and writes its URL, anon key and service-role key into `.env.development.local` (gitignored by `.env*`). Copy the remaining variable *names* from `.env.local`; leave the values for third-party services (Twilio, Gmail, Groq, Clover, VAPID) blank so the dev app cannot message anyone or call paid services.
- [ ] **Step 6: Verify.** `npm run dev` starts, and the guard prints the dev host (not the live one).
- [ ] **Checkpoint:** stage the scripts and `package.json`.

---

### Task 7: Seed the dev project and index with Graphify

**Files:**
- Create: `docs/superpowers/findings/2026-11-24-dev-setup.md`

**Interfaces:**
- Consumes: a running dev app (Task 6) and the seeder `seedDemoOrg(admin, userId)` in `lib/demo/seed.ts`, reached through `POST /api/demo`.

- [ ] **Step 1: Seed.** Read `app/api/demo/route.ts` to see what it needs (fields, any bot check). With the dev server running, create a demo org the way the landing page's demo button does. Record the exact request and the demo user's sign-in in the setup note.
- [ ] **Step 2: Verify.** Sign in as the demo user in the browser and confirm `/app/dashboard` renders with seeded data. Confirm in the dev project's table editor that an organization with slug prefix `demo-tipsy-tavern-` exists.
- [ ] **Step 3: Index with Graphify.** Confirm `.env*` is excluded from what Graphify reads (`.gitignore` covers `.env*`; add a `.graphifyignore` if Graphify does not honor it). Run `graphify` on the repo root. Docs and images are sent to the Claude API for extraction and code stays local: say so in the setup note. Open `graphify-out/GRAPH_REPORT.md` and record the five most connected modules.
- [ ] **Checkpoint:** stage the setup note and `.graphifyignore` if added.

---

### Task 8: Route inventory

**Files:**
- Create: `scripts/walkthrough/routes.ts`, `scripts/walkthrough/routes.test.ts`, `scripts/walkthrough/build-inventory.ts`
- Create (output): `docs/superpowers/findings/route-inventory.md`

**Interfaces:**
- Produces, in `routes.ts`: `type RouteEntry = { path: string; kind: 'page' | 'api'; group: 'public' | 'auth' | 'app' | 'staff'; needsParams: boolean }` and `function routesFromFiles(files: string[]): RouteEntry[]` (input: posix paths relative to the repo root, such as `app/(app)/app/payroll/page.tsx`; output sorted by `path`).

- [ ] **Step 1: Write failing tests** for `routesFromFiles`:
  - `app/page.tsx` gives `{path: '/', kind: 'page', group: 'public', needsParams: false}`.
  - `app/(app)/app/payroll/page.tsx` gives `/app/payroll`, group `app`.
  - `app/(auth)/login/page.tsx` gives `/login`, group `auth`. `app/(staff)/me/page.tsx` gives `/me`, group `staff`.
  - `app/api/demo/route.ts` gives `/api/demo`, kind `api`.
  - `app/(app)/app/x/[id]/page.tsx` has `needsParams: true`; so does `[...slug]`.
  - Files under `_components`, files under `@slot`, and files that are not `page.tsx` or `route.ts` are dropped.
  - `app/privacy/page.tsx`, `app/terms/page.tsx` are group `public`.
- [ ] **Step 2: Run** `npx vitest run scripts/walkthrough` and confirm FAIL.
- [ ] **Step 3: Implement** `routesFromFiles`: strip route-group segments from the path and derive `group` from the route-group segment: `(app)` is `app`, `(auth)` is `auth`, `(staff)` is `staff`, no group is `public`.
- [ ] **Step 4: Run the tests** and confirm PASS.
- [ ] **Step 5: `build-inventory.ts`** lists `app/**/page.tsx` and `app/**/route.ts` and writes `route-inventory.md` as a table `path | kind | group | needs params`, with an empty `Checked` column for Task 9. Run it; the count of page routes should be at least the 37 found today.
- [ ] **Checkpoint:** stage the scripts and the inventory.

---

### Task 9: Walk every screen

**Files:**
- Create: `docs/superpowers/findings/2026-11-24-walkthrough.md`
- Create: `docs/superpowers/findings/walkthrough/` (screenshots)

**Interfaces:**
- Consumes: `route-inventory.md` (Task 8), the dev app and demo sign-in (Task 7), Playwright MCP tools.

- [ ] **Step 1: Pre-flight.** Confirm the running app's Supabase host is the dev host: read it from the guard's output. If it is the live host, stop.
- [ ] **Step 2: Walk.** For every `kind: 'page'` route with `needsParams: false`, at 1280×800 and 390×844, using Playwright MCP: navigate; record the final URL (redirects), HTTP outcome, console errors, failed network requests, whether primary content rendered, and take a screenshot. For routes with params, open one real record from the seeded data. Tick `Checked` in the inventory.
- [ ] **Step 3: Exercise each page's main actions** (create, edit, submit, delete a seeded record) on the dev project. Record what happens.
- [ ] **Step 4: Write the findings table:** `route | viewport | what happened | severity | suspected cause`. Severity: **P0** loses or corrupts data or money, or blocks sign-in; **P1** a feature does not work; **P2** looks or reads wrong; **P3** polish. Add a short list of screens that fail the spec's laws on sight; Plan 2 does the full audit.
- [ ] **Checkpoint:** stage the findings.

---

### Task 10: Fix by severity

**Files:**
- Modify: whatever each finding names; one commit-sized change per finding.

- [ ] **Step 1: Order** the findings P0 first. Show the owner the P0 and P1 list before starting.
- [ ] **Step 2: For each finding:** write a failing test if the fault is in a pure function under `lib/` (name it after the behavior), or write a reproduction in the findings file if it is UI; make the smallest fix; rerun the test and `npx tsc --noEmit`; rerun the page in the dev app and screenshot it.
- [ ] **Step 3: Gates after each fix:** `npm test`, `npm run audit:scope`, `npm run lint`. Anything touching money, tips, stock or tenancy stops for the owner's review.
- [ ] **Step 4:** P2 and P3 findings stay in the findings file and carry into Plan 2.
- [ ] **Checkpoint after each fix:** stage that fix's files only.

---

### Task 11: Close out

**Files:**
- Modify: `docs/superpowers/findings/2026-11-24-walkthrough.md` (add status column)

- [ ] **Step 1:** Rerun `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run audit:scope`, `npm run build`. All must pass; record the output in the baseline note, side by side with Task 3.
- [ ] **Step 2:** Mark each finding `fixed`, `deferred` (with reason) or `needs owner`.
- [ ] **Step 3:** Report to the owner: what was installed, what was broken, what is fixed, what carries forward. Ask for the go-ahead to write Plan 2.
