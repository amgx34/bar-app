# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Bar owner-operators and the managers who run the bar day to day. Both share the same screens; roles differ only where money is at stake (an owner approves pay runs). They work in the operating hours of a bar: counting stock, checking the night's sales, settling tips and payroll, ordering from reps, often after close and often on a phone. Bartenders and other staff are a secondary audience through a separate staff portal (`/me`) that shows their own shifts and pay.

## Product Purpose

Rail is bar management software that brings inventory, payroll and tip splits, nightly Z-report sales analytics, taxes and supplier (rep) ordering into one app, built specifically for bar operators. One organization is one bar. Success is a bar that closes its night and its books in one place, with figures it can trust.

## Positioning

One app for the whole bar, in place of separate tools for stock, scheduling and pay, sales reports and ordering. (Confirmed by the owner as the main edge; stronger mechanisms in the code, such as POS sales depleting stock automatically, are not claimed as positioning until the owner says so.)

## Operating Context

- Sales and stock data arrive from the bar's POS: a Windows agent on the bar PC pushes Z reports, employee-week data and the item audit; an email fallback exists for bars without the agent.
- Supported POS today: 2Touch; Clover sync exists in the codebase. No other POS integration may be claimed.
- Payroll covers tip pooling, tax withholding, direct deposit (NACHA export) and per-period payouts; pay runs are frozen snapshots approved by an owner.
- Work happens on a phone behind the bar as much as at a desk: mobile bottom navigation and a floating action button already exist.

## Capabilities and Constraints

- Multi-tenant: every view is scoped to the signed-in bar; staff see only their own data.
- Money, tips, stock and tax figures must be exact and traceable. Costs are recorded, not inferred; a number on screen must agree with the screen it links to.
- Empty states must say what to connect (for example, "the Rail agent on the bar PC records it") rather than imply zero activity. A bar with no POS feed is not a bar with no sales.
- Terminology in use: Z report, rep (supplier sales representative), par level, pour size, shipment, pay run, snapshot, cash tips, tip pool.
- Undecided: whether to pursue other POS integrations or other venue types beyond bars and taverns (the landing page lists several venue types).

## Brand Commitments

The product name is Rail. The existing look carries a monospace-flavored heading face and a deep-navy sidebar; whether that identity is binding or open to replacement has not been decided. A `design-system/rail` folder exists in the repo.

## Evidence on Hand

- A seeded demo org ("Demo Bar — The Tipsy Tavern") created through `POST /api/demo`, used for walkthroughs.
- A public `/accessibility` page and landing page copy in `lib/site.ts` and `app/page.tsx`.
- Absent: named customers, testimonials, benchmarks and pricing. Do not invent them.

## Product Principles

1. **One app, one source of truth.** A figure appears the same wherever it is shown; screens link to one another instead of restating numbers.
2. **Exact over impressive.** Money, tips, stock and tax favor precision, provenance and auditability over summary and flourish.
3. **Built for the floor.** Primary tasks must work one-handed on a phone in a dim bar, with touch targets and type sized for it.
4. **Say what is missing.** An absent feed, an unset price or a not-yet-closed night is stated plainly and points to the fix; silence is never shown as zero.
5. **Roles gate actions, not understanding.** A manager who cannot approve a pay run still sees why it is waiting.

## Accessibility & Inclusion

WCAG 2.2 AA is the required standard: keyboard operation, screen-reader names for every field and control, AA contrast, and usable touch targets. Phone-first use in low light makes contrast and target size matter more than usual.
