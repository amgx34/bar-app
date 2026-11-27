# UI/UX audit, static pass (Impeccable)

Scope: 22 `/app/*` pages under the demo session, plus the Impeccable detector over `app/` and `components/`.
**Not done:** rendered checks (screenshots at 1280x800 and 390x844, contrast, touch targets, console errors).
Playwright's Chromium download stalled (about 0.4 MB of ~150 MB) and no Chrome is installed on this Mac.
No PRODUCT.md or DESIGN.md exists, so the design-intent judgment is deferred until `/impeccable init`.

| # | Sev | Finding | Where |
|---|---|---|---|
| 1 | P1 (fixed) | Nested `<main>`: layout renders one, pages and loading skeletons render a second. Two to five landmarks per page breaks screen-reader landmark navigation and RouteFocus's target (WCAG 1.3.1 / 4.1.1). | `app/(app)/app/layout.tsx:61`; `sales/page.tsx:78,130`, `books/page.tsx:194`, `inventory/page.tsx:78,82`, `inventory/weigh/page.tsx:17`, `inventory/setup/page.tsx:34`, `inventory/analytics/page.tsx:46`, `*/loading.tsx` |
| 2 | — | **Withdrawn.** The "no `<h1>`" pages (employees, inventory/loss, sales/categories, sales/margins, analytics) are all server redirects; `/sales` has its `<h1>`. A first-pass false positive. | — |
| 3 | P2 | 5 "side-tab" accent borders (`border-l-4` on rounded cards), flagged by the detector. | `employees/_components/employee-roster.tsx:137` and 4 more |
| 4 | P2 | Overused-font signal (2 hits) and a decorative grid-line background (1 hit), both in the detector output. | detector JSON |
| 5 | P2 | Dev console shows a Recharts `width(-1) height(-1)` warning on the dashboard (from the earlier setup note). | `DashboardRevenueChart` |
| 6 | P3 | About 7 icon-only buttons per page, 66 on inventory. aria-label counts are in line with that, but each needs confirming in the rendered tree. | sidebar, inventory rows |

All 22 routes returned 200 and none redirected, so no route is broken. No `<img>` lacks alt text.

## Next
1. ~~Fix 1~~ done: inner `<main>` changed to `<div>` in 9 files; `tsc` clean.
2. Get a browser working (or run the walk on the PC) for the rendered pass and screenshots.
3. `/impeccable init` to capture PRODUCT.md before any critique or redesign.

---

## Rendered pass (Chrome, demo session, 22 pages at 1280x800 and 390x844)

Clean: no console errors, no failed requests, no horizontal scroll at either size, every page rendered content.
Method limit: one demo org with no POS agent, so sales/shipments/weigh show empty states; I judged layout, not data-heavy states.

| # | Sev | Finding | Where |
|---|---|---|---|
| 7 | P1 | Form fields have a visible label that is not programmatically tied to the input (`input.labels` is empty): Phone, City, Address, routing and account numbers, EIN, ZIP and more. Screen readers announce them as unnamed edit fields and tapping the label does not focus the field (WCAG 1.3.1, 4.1.2, 3.3.2). About 10 fields on Settings, 7 on Tax, 1 on Payroll. Base UI's own hidden helper inputs are excluded from this count. | `/app/settings`, `/app/tax`, `/app/payroll/employees` |
| 8 | P2 | Checkboxes are 13x13 on the employees tax/tips rows; Pool / Individual / Sales % toggles are 20px tall. Below the 24px WCAG 2.5.8 floor, well below 44px on touch. | `/app/payroll/employees` |
| 9 | P2 | On mobile the floating "+" button covers part of the Quick Actions grid on the dashboard and sits over page content generally. | `MobileFab`, `/app/dashboard` |
| 10 | P2 | Settings tab strip clips "Import Data" at 390px with no visible scroll cue; the page title wraps to two lines on the dashboard. | `/app/settings` |
| 11 | P3 | Inline text links 16-20px tall ("Analytics", "Full analytics", "+23 more low-stock items"). Sidebar toggle is a 16px-wide rail. | `/app/dashboard` |

Not a defect: the Next.js "N" dev badge overlaps the mobile bottom nav in dev builds only.

Positives: consistent card/stat system, clear section grouping in the sidebar, honest empty states that say what to connect, no layout break at 390px on any page.

## Fixed

- #1 nested `<main>`: inner `<main>` is now a `<div>` in 9 files.
- #7 unlabeled fields: `components/ui/label.tsx` ties a bare `<Label>` to the next form control after mount (explicit `htmlFor` still wins; wrapping labels untouched). Re-probed Settings, Tax, Payroll employees: only Base UI's hidden helper inputs remain. Still open: the inventory search box has a placeholder but no accessible name (P2).
- Gates: `tsc` clean, `npm test` 989/989, lint unchanged from baseline (64 problems, none in changed files).
