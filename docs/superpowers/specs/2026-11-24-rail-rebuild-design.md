# Rail rebuild — design

Date: 2026-11-24. Status: draft, awaiting owner approval.
Repo: `bar-app` (Next.js 16 + Supabase, multi-tenant, one org = one bar).

## Intent and why

Rail already does a lot for a bar: inventory with POS-driven depletion, payroll,
tips, Z reports, books, a POS agent. The owner wants to turn it into a product
they can **sell to bars and restaurants** through cold calls and social media,
positioned as an **all-in-one logistics platform** for the industry, and then
rebuild it as a **mobile app**.

Three things stand between today's Rail and that:

1. **The front door doesn't sell.** The landing page has no animation library, no
   public price, and one lead form ("request a demo").
2. **The back end is hard to read.** About 36 routes under `/app` with no single
   obvious place to start; the owner calls it confusing.
3. **It isn't proven.** `npx tsc --noEmit` is clean, but all 54 vitest files fail
   to load (`TypeError: Cannot read properties of undefined (reading 'config')`
   at the first `describe`, reproduced on a single file, vitest 4.1.11 + vite
   8.2.1). The money functions are the part of this product that must be right,
   and right now nothing checks them.

## Goals

- A front page with scroll-driven animation of the quality seen on award-style
  sites, that still loads fast on a phone and works with motion turned off.
- A back end reduced to about five top-level destinations, shaped so they become
  the mobile app's tab bar without redesign.
- Every screen judged against the 16 laws below, with the findings written down.
- A competitor comparison (live pages and pricing, not memory) that sharpens the
  positioning.
- Broken features found by walking every screen, listed, and fixed.
- A go-to-market pack: positioning, ideal customer, cold-call scripts and
  cadence, a social calendar, a launch video, pricing hypotheses.
- A monetization design: how Rail charges for itself, and what to do about
  direct deposit.

## Non-goals

- The mobile app (next project; this one only keeps the door open).
- Restaurant-only features (recipe and food costing, kitchen display). They go on
  a roadmap. Copy claims "bars and restaurants" only where the product backs it.
- Rail holding or moving employee money (see Monetization).
- Rewriting business logic in `lib/`. Money functions are fixed, never reshaped
  for looks.

## Anti-goals (a failure even if it ships)

- A pretty page driving cold calls into a demo that breaks.
- Any regression in payroll, tips, COGS or stock math, or any query that drops
  an `organization_id` filter (`npm run audit:scope` must stay green).
- Animation that makes the page unusable on a mid-range phone, or ignores
  `prefers-reduced-motion`.
- Claims in marketing that the product doesn't support.

## Constraints

- Next.js 16 differs from training data. Read `node_modules/next/dist/docs/`
  before writing Next code. UI is Base UI, not Radix. Follow `AGENTS.md`
  invariants (tenancy scoping, delivery costs, pos_config writers, payroll
  snapshots).
- Work happens on a branch. `feat/payroll-tax-withholding` is 31 commits ahead of
  master and unmerged; the `inventory-shipments` and `sales-stage-c` worktrees
  are 0 ahead (already merged) and can be removed.
- No commits or pushes without the owner asking.
- No `claude` CLI on this machine: plugins are installed by editing
  `~/.claude/plugins/` and `settings.json` by hand (back both up first).
  New skills appear after a session restart.

## Approaches considered

- **A. Front door first.** Fastest to something postable; drives traffic at an
  unproven demo.
- **B. Product first.** Most honest; nothing to post for a long time, marketing
  can't be tested.
- **C. Stabilize, then build both together** — **chosen by the owner.** Fix and
  verify, set one shared design system, then run the landing page and the
  back-end simplification as two tracks with the marketing plan alongside.

## Phases (approach C)

**0. Tooling.** Install from official sources only: ponytail
(`DietrichGebert/ponytail`), Graphify (`graphifyy` on PyPI, repo
`Graphify-Labs/graphify`), ECC (`affaan-m/ECC`, project-scoped, because it adds
many hooks and agents on top of Superpowers), Impeccable (`pbakaus/impeccable`),
Hallmark (`Nutlope/hallmark`), brag (`latent-spaces/brag`). Note commit SHAs;
read each hook script before enabling it.

**1. Stabilize.** Diagnose and fix the vitest failure and get the suite green;
run lint, tsc and `audit:scope`; build the safe database copy (below); then start
the app **against the dev project only** and walk every route (Playwright) at
desktop and phone widths; write the broken-feature list; fix by severity.

**2. Audit and compare.** Competitor matrix from live pages (Toast, MarginEdge,
BevSpot, WISK, MarketMan, Bar Cop, 7shifts, Restaurant365, others found). Screen
by screen critique of Rail with Impeccable and Hallmark, scored against the laws.

**3. Design system and navigation.** One set of tokens for site and app. A
proposed five destinations (to be validated by phase 2):

| Destination | Holds today's |
|---|---|
| Today | dashboard |
| Stock | inventory, shipments, weigh, loss, setup |
| Sales | sales, margins, categories, analytics |
| Team & Pay | employees, payroll (+review, split, direct deposit), tips, tax |
| Books | books, reports |

Settings and Reps move to a profile menu. Staff `/me` stays separate.

**4a. Front page.** Scroll-driven story (GSAP + Lenis unless the builder finds
better), real product visuals, one primary call to action repeated at the
natural stopping points, a pricing section, social proof only where real,
reduced-motion fallback, a performance budget on a phone.

**4b. App simplification.** Navigation, page structure, defaults and empty
states per the laws. Progress surfaces for unfinished work.

**5. Go-to-market pack.** `docs/go-to-market/`: positioning and ideal customer,
cold-call scripts and cadence, objection handling, social calendar and launch
video, pricing hypotheses, metrics. Calling rules (do-not-call, state telemarketing
and text-message consent) get a note to confirm with counsel before any calling.

**6. Mobile readiness.** Keep new logic in `lib/`. Server actions cannot be
called by a native app, so the mobile project will need a thin API layer; not
built here.

## The 16 laws, applied

| Law | What it means for Rail |
|---|---|
| Hick | Few choices per screen; one obvious next step |
| Fitts | Primary actions large and reachable; bottom tab bar on phones |
| Jakob | Use patterns bar owners already know (sidebar, tab bar, POS-style cards) |
| Proximity | An action sits beside the data it changes (approve next to the diff) |
| Miller | At most 5 top-level destinations; chunk long lists |
| Doherty | Feedback inside 400 ms: skeletons, optimistic updates |
| Von Restorff | One accent colour reserved for the primary action and real alerts |
| Minimize target distance | Fewer clicks and less pointer travel between related actions |
| Serial position | Most important items first and last in nav and lists |
| Peak-End | Make the end of key flows (payroll approved, setup done) feel good; end the landing page on the call to action |
| Zeigarnik | Show unfinished work (setup checklist, open pay run) so people finish it |
| Prägnanz | Reduce each screen to its simplest readable form |
| Similarity | Same function, same look; different function, different look |
| Uniform connectedness | Group related items inside one container |
| Tesler | Complexity can't be removed, only moved: push it into defaults and automation |
| Postel | Accept messy input (dates, CSV, phone formats); output strict and clean |

(The owner's list had an empty 17th item; it can be added.)

## Monetization (decided now, built later)

**Subscriptions: Stripe Billing.** Checkout in subscription mode, the customer
portal for plan changes and cards, free trials, per-seat or per-location
quantities, webhooks for the lifecycle. Card or ACH debit. Packages map to
products, so a custom bundle is one subscription with several items. Nothing in
the repo bills today. Pricing hypotheses go in phase 5; public tiers beat "call for a
quote" for self-serve social traffic, but that is the owner's call.

**Direct deposit: three levels, in order of how much Rail takes on.**

1. *Today:* `lib/payroll/nacha.ts` writes a NACHA file; the **bar's own bank**
   sends the money. Rail never touches funds, holds no license, carries no
   funding risk. Weakness: some small bars' banks don't offer ACH origination.
2. *Payout rail:* Stripe Global Payouts (payout intents over ACH with
   `transaction_purpose: payroll`), Moov, Dwolla or Modern Treasury. The bar
   funds a balance and Rail sends. Rail then owns KYB on each bar, returned
   payments, fraud, and NACHA third-party-sender duties. Whether Rail needs
   money-transmitter licensing depends on structure: get counsel first.
3. *Embedded payroll* (Check, Gusto Embedded, Zeal): the provider becomes the
   payroll provider of record, withholds, deposits and files taxes, issues W-2s.
   This would replace the in-house withholding engine on the current branch.

**Decision recorded:** ship at level 1; keep the payout step behind an interface
so level 2 or 3 can be swapped in; revisit after real customers ask. Stripe is
the only single vendor found whose docs cover both subscriptions and
payroll-purpose ACH payouts, but payout access needs Stripe's approval and has
not been confirmed for Rail.

## Left to the builder

Animation stack and scenes, exact route-to-destination mapping, token values,
copy, the vitest root cause, competitor list beyond the named ones, and test
design for the new navigation.

## Established from the repo

- **Demo data exists.** `lib/demo/` seeds throwaway orgs (`demo-tipsy-tavern-*`,
  capped by `MAX_LIVE_DEMO_ORGS`). Landing visuals and the launch video are
  captured from a demo org, never from a real bar.
- **The payout seam already exists.** `generateNachaFile(cfg, entries)` in
  `lib/payroll/nacha.ts` is a pure function over typed inputs. This round
  documents it and does not touch it.
- **One environment.** Only `.env.local` exists, with one Supabase project and no
  staging link. Nothing here proves it is not production (see Open questions).
- **POS coverage is partial.** Live feeds are 2Touch (agent and email) and Clover.
  Payroll and Z-report CSV/text upload paths give a partial POS-free route.

## Calls made without the owner (flag if wrong)

- Five destinations, with Settings in a profile menu.
- GSAP + Lenis for animation.
- ECC scoped to this project, not installed globally.
- Restaurants named as a target, with restaurant-only features left on a roadmap.
- Billing and payouts are design-only in this round.
- This doc is uncommitted, because commits wait for the owner's go-ahead.
- Primary call to action stays "request a demo". No price numbers on the page
  until billing exists, because a published price nobody can pay is a promise the
  product can't keep. Price hypotheses go in the sales scripts only.
- Phase 5 delivers written documents, a storyboard, and a launch video rendered
  with brag from a demo org. Anything only the owner knows (prices, social
  handles, brand assets, testimonials, lead lists) is marked TODO, never invented.
  The scripts are written for the owner to use.
- If a money test fails once the suite loads, work stops and the owner is asked.
  Expectations are never edited to match the code.
- New work branches from the current `feat/payroll-tax-withholding` unless the
  owner's answer below says otherwise.

## Decisions from the owner

1. **Database.** The owner doesn't know whether the project in `.env.local` is
   live, and told us to build a way to reconstruct the database from Supabase
   (and to Graphify it). **Treated as live until shown otherwise:** nothing in
   this project clicks through screens or runs writes against it. See
   "Rebuilding a safe copy" below.
2. **Packages.** Rail is sold as packages designed around each bar's needs, not
   one fixed product. See "Packages" below.
3. **First customers.** US only, Cincinnati area, the owner's own bar plus other
   bars, on live 2Touch or Clover feeds.

## Packages

Each org gets a set of packages (modules) such as Stock, Sales, Team & Pay, Books.
One mechanism then does four jobs:

- **Navigation.** An org sees only what it bought, which is Hick's and Miller's
  laws for free: a bar that only wants stock never sees payroll.
- **Pricing.** Each package maps to a Stripe product, so a custom bundle is a
  subscription with several items (Monetization below).
- **Selling.** The cold call becomes needs discovery ("what costs you the most
  sleep: stock, payroll, tips?") and the package is designed from the answers.
- **Mobile.** The same entitlements decide which tabs the app shows.

Nothing in the schema models this today (no plan, tier or entitlement column
found). It needs one table keyed by `organization_id`, scoped like every other.
The exact shape is left to the builder.

**Payroll tax withholding** is part of the payroll package, off by default and
enabled per org. It is not claimed in marketing, and not enabled for any bar,
until it has been checked against the official tables. The code stays.

## First customers

Independent bars around Cincinnati (and across the river in Northern Kentucky)
running 2Touch or Clover. Marketing is local and relationship-led: the owner's
own bar is the first real case study, with the owner's permission and real
numbers. "Social proof only where real" holds. Lead lists are the owner's input
(public liquor-permit records are a likely source; to be verified).

## Rebuilding a safe copy of the database

The CLI route is closed here: no Supabase CLI, Docker, psql or pg_dump. So:

1. **Schema export, read-only.** A single `SELECT` in
   `supabase/diagnostics/export-schema.sql`, in the style of the existing files in
   that folder. The owner pastes it into the Supabase SQL editor and saves the
   result. It reads `pg_catalog` for tables, columns, constraints, indexes, RLS
   policies, functions and triggers, and returns no row data. No password or
   connection string is shared.
2. **Baseline migration.** A script turns that export into SQL that recreates the
   schema in a new, empty Supabase project (the migrations alone cannot, because
   the base org and membership tables were created outside the repo).
3. **Dev project.** Seed it with the existing demo-org seeder. All screen
   walkthroughs, fixes and screenshots run there.
4. **Graphify** indexes the export and the code together.

The export contains structure only, so it is safe to keep in the repo, but the
owner should read it once before it is committed.
