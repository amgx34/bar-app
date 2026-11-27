# Measured evidence: six Rail screens

Evidence only. Dev server localhost:3000, demo org, Chrome (system) via Playwright, read-only (no clicks, no POST). Viewports 1280x800 and 390x844, light and dark (localStorage theme set before load, 1.5s settle). Load time = navigation start to first visible h1 or table, three fresh-context runs, median (dev server, so first run includes compile). Contrast = computed text colour composited over the stacked ancestor backgrounds, per distinct (fg, bg, size, weight) style; threshold 4.5:1, 3:1 for large text (>=24px, or >=18.66px bold). Small targets = visible a/button/input/select/textarea/summary/role controls; "<24" any side under 24px; "<44" (mobile only) any side under 44px and not inside a <p>. Focus = first 12 Tab stops, counted when a non-none outline or box-shadow is computed.

Note on /app/sales: the first pass (1.5s settle) caught /app/sales with a <main> but no h1 and no controls, before the page rewrote the URL to ?start=2026-11-24&end=2026-11-24&hour=2 (Playwright's final URL is that rewritten one in most runs). The sales figures below are from a re-run that waits for the h1 (up to 12s), so they describe the settled page; the pre-redirect blank state lasted over 1.5s in at least two runs.

## Detector (impeccable 4.10.0 detect --json, static scan)

Scanned all .ts/.tsx/.css under each folder (payroll 45 files, inventory 32, sales 17, books 7). Total findings: payroll 10, inventory 4, books 1, sales 0 (empty array: 17 files scanned, none matched a rule; this is only the detector's rule set, not a clean bill).

**payroll** (10)
- side-tab: /Users/xavierdichiara/bar-app/app/(app)/app/payroll/_components/day-split-tab.tsx:435 - border-l-4
- side-tab: /Users/xavierdichiara/bar-app/app/(app)/app/payroll/_components/day-split-tab.tsx:440 - border-l-4
- design-system-font-size: /Users/xavierdichiara/bar-app/app/(app)/app/payroll/_components/direct-deposit-tab.tsx:235 - text-[…] class: 10px is off the DESIGN.md type ramp
- design-system-font-size: /Users/xavierdichiara/bar-app/app/(app)/app/payroll/_components/direct-deposit-tab.tsx:239 - text-[…] class: 10px is off the DESIGN.md type ramp
- design-system-font-size: /Users/xavierdichiara/bar-app/app/(app)/app/payroll/_components/direct-deposit-tab.tsx:246 - text-[…] class: 10px is off the DESIGN.md type ramp
- design-system-font-size: /Users/xavierdichiara/bar-app/app/(app)/app/payroll/_components/import-tab.tsx:52 - text-[…] class: 10px is off the DESIGN.md type ramp
- design-system-font-size: /Users/xavierdichiara/bar-app/app/(app)/app/payroll/review/page.tsx:253 - text-[…] class: 10px is off the DESIGN.md type ramp
- design-system-font-size: /Users/xavierdichiara/bar-app/app/(app)/app/payroll/review/page.tsx:385 - text-[…] class: 10px is off the DESIGN.md type ramp
- design-system-font-size: /Users/xavierdichiara/bar-app/app/(app)/app/payroll/review/page.tsx:389 - text-[…] class: 10px is off the DESIGN.md type ramp
- design-system-font-size: /Users/xavierdichiara/bar-app/app/(app)/app/payroll/review/page.tsx:464 - text-[…] class: 10px is off the DESIGN.md type ramp

**inventory** (4)
- design-system-font-size: /Users/xavierdichiara/bar-app/app/(app)/app/inventory/_components/inventory-import-dialog.tsx:232 - text-[…] class: 10px is off the DESIGN.md type ramp
- design-system-font-size: /Users/xavierdichiara/bar-app/app/(app)/app/inventory/_components/inventory-import-dialog.tsx:236 - text-[…] class: 10px is off the DESIGN.md type ramp
- design-system-font-size: /Users/xavierdichiara/bar-app/app/(app)/app/inventory/shipments/_components/log-shipment-dialog.tsx:488 - text-[…] class: 10px is off the DESIGN.md type ramp
- design-system-font-size: /Users/xavierdichiara/bar-app/app/(app)/app/inventory/shipments/_components/log-shipment-dialog.tsx:520 - text-[…] class: 10px is off the DESIGN.md type ramp

**sales** (0)
- none

**books** (1)
- design-system-color: /Users/xavierdichiara/bar-app/app/(app)/app/books/_components/books-charts.tsx:77 - Undocumented color #e11d48 is outside DESIGN.md colors

## payroll-week: `/app/payroll?view=week`

| viewport/theme | final URL (status) | main/h1 | headings | heading skips | console err+warn | CLS | overflow sw/cw | doc height | contrast fails/styles | <24px | <44px | no-name ctl/pbar | img no alt | focus ring visible | load ms (runs) median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop light | /app/payroll?view=week (200) | 1/1 | 1222222 | none | 2 | 0 | 1280/1280 | 1291 | 2/45 | 4 | n/a | 2/0 | 0 | 12/12 | 531/539/544 -> 539 |
| desktop dark | /app/payroll?view=week (200) | 1/1 | 1222222 | none | 2 | 0 | 1280/1280 | 1291 | 0/46 | 4 | n/a | 2/0 | 0 | 12/12 | 533/545/540 -> 540 |
| mobile light | /app/payroll?view=week (200) | 1/1 | 12222223 | none | 2 | 0 | 390/390 | 2671 | 1/32 | 0 | 6 | 2/0 | 0 | 12/12 | 537/565/552 -> 552 |
| mobile dark | /app/payroll?view=week (200) | 1/1 | 12222223 | none | 2 | 0 | 390/390 | 2671 | 0/33 | 0 | 6 | 2/0 | 0 | 12/12 | 561/534/547 -> 547 |

Contrast failures, desktop light:
- 2.92:1, 14px/600, fg(225,113,0) on bg(242,245,249), x2, "0.00"
- 3.06:1, 14px/400, fg(225,113,0) on bg(248,250,252), x2, "0.00"

Controls under 24px, desktop light: a "Skip to content" 1x1; button "Toggle Sidebar" 16x800; button "Show each night for Ka" 20x20; button "Show each night for We" 20x20

Controls without accessible name, desktop light: textarea "Paste your full Z repo"; textarea "Paste your Employee Wo"

Console, desktop light: warning: The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and hei

Controls under 24px, desktop dark: a "Skip to content" 1x1; button "Toggle Sidebar" 16x800; button "Show each night for Ka" 20x20; button "Show each night for We" 20x20

Controls without accessible name, desktop dark: textarea "Paste your full Z repo"; textarea "Paste your Employee Wo"

Console, desktop dark: warning: The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and hei

Contrast failures, mobile light:
- 3.2:1, 14px/400, fg(225,113,0) on bg(255,255,255), x1, "$0.00"

Controls without accessible name, mobile light: textarea "Paste your full Z repo"; textarea "Paste your Employee Wo"

Console, mobile light: warning: The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and hei

Controls without accessible name, mobile dark: textarea "Paste your full Z repo"; textarea "Paste your Employee Wo"

Console, mobile dark: warning: The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and hei

## payroll-day: `/app/payroll?view=day&date=2026-11-19`

| viewport/theme | final URL (status) | main/h1 | headings | heading skips | console err+warn | CLS | overflow sw/cw | doc height | contrast fails/styles | <24px | <44px | no-name ctl/pbar | img no alt | focus ring visible | load ms (runs) median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop light | /app/payroll?view=day&date=2026-11-19 (200) | 1/1 | 1 | none | 0 | 0.0001 | 1280/1280 | 800 | 0/15 | 2 | n/a | 1/0 | 0 | 12/12 | 519/503/514 -> 514 |
| desktop dark | /app/payroll?view=day&date=2026-11-19 (200) | 1/1 | 1 | none | 0 | 0.0001 | 1280/1280 | 800 | 0/15 | 2 | n/a | 1/0 | 0 | 12/12 | 527/500/517 -> 517 |
| mobile light | /app/payroll?view=day&date=2026-11-19 (200) | 1/1 | 1 | none | 0 | 0.0005 | 390/390 | 844 | 0/14 | 0 | 4 | 1/0 | 0 | 12/12 | 525/528/512 -> 525 |
| mobile dark | /app/payroll?view=day&date=2026-11-19 (200) | 1/1 | 1 | none | 0 | 0.0005 | 390/390 | 844 | 0/14 | 0 | 4 | 1/0 | 0 | 12/12 | 518/523/525 -> 523 |

Controls under 24px, desktop light: a "Skip to content" 1x1; button "Toggle Sidebar" 16x800

Controls without accessible name, desktop light: input[type=date] ""

Controls under 24px, desktop dark: a "Skip to content" 1x1; button "Toggle Sidebar" 16x800

Controls without accessible name, desktop dark: input[type=date] ""

Controls without accessible name, mobile light: input[type=date] ""

Controls without accessible name, mobile dark: input[type=date] ""

## payroll-review: `/app/payroll/review`

| viewport/theme | final URL (status) | main/h1 | headings | heading skips | console err+warn | CLS | overflow sw/cw | doc height | contrast fails/styles | <24px | <44px | no-name ctl/pbar | img no alt | focus ring visible | load ms (runs) median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop light | /app/payroll/review (200) | 1/1 | 13223 | 1->3 | 0 | 0 | 1280/1280 | 1501 | 1/39 | 5 | n/a | 0/0 | 0 | 12/12 | 528/535/538 -> 535 |
| desktop dark | /app/payroll/review (200) | 1/1 | 13223 | 1->3 | 0 | 0 | 1280/1280 | 1501 | 1/41 | 5 | n/a | 0/0 | 0 | 12/12 | 537/534/487 -> 534 |
| mobile light | /app/payroll/review (200) | 1/1 | 13223 | 1->3 | 0 | 0 | 390/390 | 2217 | 1/37 | 0 | 1 | 0/0 | 0 | 12/12 | 503/512/769 -> 512 |
| mobile dark | /app/payroll/review (200) | 1/1 | 13223 | 1->3 | 0 | 0 | 390/390 | 2217 | 1/39 | 0 | 1 | 0/0 | 0 | 12/12 | 534/534/587 -> 534 |

Contrast failures, desktop light:
- 3.65:1, 14px/500, fg(255,255,255) on bg(0,153,102), x1, "Confirm Payroll"

Controls under 24px, desktop light: a "Skip to content" 1x1; button "Toggle Sidebar" 16x800; a "Back" 52x20; a "Payroll" 61.0x20; a "This week" 53.2x16

Contrast failures, desktop dark:
- 3.65:1, 14px/500, fg(255,255,255) on bg(0,153,102), x1, "Confirm Payroll"

Controls under 24px, desktop dark: a "Skip to content" 1x1; button "Toggle Sidebar" 16x800; a "Back" 52x20; a "Payroll" 61.0x20; a "This week" 53.2x16

Contrast failures, mobile light:
- 3.65:1, 14px/500, fg(255,255,255) on bg(0,153,102), x1, "Confirm Payroll"

Contrast failures, mobile dark:
- 3.65:1, 14px/500, fg(255,255,255) on bg(0,153,102), x1, "Confirm Payroll"

## inventory: `/app/inventory`

| viewport/theme | final URL (status) | main/h1 | headings | heading skips | console err+warn | CLS | overflow sw/cw | doc height | contrast fails/styles | <24px | <44px | no-name ctl/pbar | img no alt | focus ring visible | load ms (runs) median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop light | /app/inventory (200) | 1/1 | 12222 | none | 0 | 0 | 1280/1280 | 3063 | 1/24 | 3 | n/a | 2/0 | 0 | 12/12 | 841/837/828 -> 837 |
| desktop dark | /app/inventory (200) | 1/1 | 12222 | none | 0 | 0 | 1280/1280 | 3063 | 1/26 | 3 | n/a | 2/0 | 0 | 12/12 | 1004/994/981 -> 994 |
| mobile light | /app/inventory (200) | 1/1 | 12222 | none | 0 | 0 | 390/390 | 6781 | 1/20 | 1 | 2 | 2/0 | 0 | 12/12 | 888/905/904 -> 904 |
| mobile dark | /app/inventory (200) | 1/1 | 12222 | none | 0 | 0 | 390/390 | 6781 | 1/22 | 1 | 2 | 2/0 | 0 | 12/12 | 980/918/919 -> 919 |

Contrast failures, desktop light:
- 2.82:1, 12px/500, fg(142,151,164) on bg(248,250,252), x28, "Marcus Johnson"

Controls under 24px, desktop light: a "Skip to content" 1x1; button "Toggle Sidebar" 16x800; input[type=text] "" 1x1

Controls without accessible name, desktop light: input[type=text] "Search items…"; input[type=text] ""

Contrast failures, desktop dark:
- 3.59:1, 12px/500, fg(96,109,131) on bg(11,18,32), x28, "Marcus Johnson"

Controls under 24px, desktop dark: a "Skip to content" 1x1; button "Toggle Sidebar" 16x800; input[type=text] "" 1x1

Controls without accessible name, desktop dark: input[type=text] "Search items…"; input[type=text] ""

Contrast failures, mobile light:
- 2.87:1, 12px/400, fg(145,153,165) on bg(255,255,255), x28, "Marcus Johnson"

Controls under 24px, mobile light: input[type=text] "" 1x1

Controls without accessible name, mobile light: input[type=text] "Search items…"; input[type=text] ""

Contrast failures, mobile dark:
- 3.46:1, 12px/400, fg(99,113,137) on bg(19,28,46), x28, "Marcus Johnson"

Controls under 24px, mobile dark: input[type=text] "" 1x1

Controls without accessible name, mobile dark: input[type=text] "Search items…"; input[type=text] ""

## shipments: `/app/inventory/shipments`

| viewport/theme | final URL (status) | main/h1 | headings | heading skips | console err+warn | CLS | overflow sw/cw | doc height | contrast fails/styles | <24px | <44px | no-name ctl/pbar | img no alt | focus ring visible | load ms (runs) median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop light | /app/inventory/shipments (200) | 1/1 | 1 | none | 0 | 0 | 1280/1280 | 800 | 4/19 | 2 | n/a | 0/0 | 0 | 12/12 | 829/836/847 -> 836 |
| desktop dark | /app/inventory/shipments (200) | 1/1 | 1 | none | 0 | 0 | 1280/1280 | 800 | 2/19 | 2 | n/a | 0/0 | 0 | 12/12 | 725/733/721 -> 725 |
| mobile light | /app/inventory/shipments (200) | 1/1 | 1 | none | 0 | 0 | 390/390 | 844 | 4/18 | 0 | 1 | 0/0 | 0 | 12/12 | 726/732/728 -> 728 |
| mobile dark | /app/inventory/shipments (200) | 1/1 | 1 | none | 0 | 0 | 390/390 | 844 | 2/18 | 0 | 1 | 0/0 | 0 | 12/12 | 727/730/749 -> 730 |

Contrast failures, desktop light:
- 2.44:1, 12px/500, fg(230,114,115) on bg(245,228,230), x1, "Voided"
- 2.82:1, 14px/400, fg(142,151,164) on bg(248,250,252), x1, "ZW-1"
- 3.4:1, 14px/400, fg(117,135,184) on bg(248,250,252), x3, "Nov 25, 2026"
- 3.4:1, 14px/500, fg(117,135,184) on bg(248,250,252), x2, "ZZ Walk Dist"

Controls under 24px, desktop light: a "Skip to content" 1x1; button "Toggle Sidebar" 16x800

Contrast failures, desktop dark:
- 2.76:1, 12px/500, fg(172,83,87) on bg(59,37,49), x1, "Voided"
- 3.59:1, 14px/400, fg(97,109,130) on bg(11,18,32), x1, "ZW-1"

Controls under 24px, desktop dark: a "Skip to content" 1x1; button "Toggle Sidebar" 16x800

Contrast failures, mobile light:
- 2.44:1, 12px/500, fg(230,114,115) on bg(245,228,230), x1, "Voided"
- 2.82:1, 14px/400, fg(142,151,164) on bg(248,250,252), x1, "ZW-1"
- 3.4:1, 14px/400, fg(117,135,184) on bg(248,250,252), x3, "Nov 25, 2026"
- 3.4:1, 14px/500, fg(117,135,184) on bg(248,250,252), x2, "ZZ Walk Dist"

Contrast failures, mobile dark:
- 2.76:1, 12px/500, fg(172,83,87) on bg(59,37,49), x1, "Voided"
- 3.59:1, 14px/400, fg(97,109,130) on bg(11,18,32), x1, "ZW-1"

## sales: `/app/sales`

| viewport/theme | final URL (status) | main/h1 | headings | heading skips | console err+warn | CLS | overflow sw/cw | doc height | contrast fails/styles | <24px | <44px | no-name ctl/pbar | img no alt | focus ring visible | load ms (runs) median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop light | /app/sales?start=2026-11-24&end=2026-11-24&hour=2 (200) | 1/1 | 1 | none | 0 | 0 | 1280/1280 | 800 | 0/12 | 2 | n/a | 0/0 | 0 | 12/12 | 2337/2313/2335 -> 2335 |
| desktop dark | /app/sales?start=2026-11-24&end=2026-11-24&hour=2 (200) | 1/1 | 1 | none | 0 | 0 | 1280/1280 | 800 | 0/13 | 2 | n/a | 0/0 | 0 | 12/12 | 1399/1389/1405 -> 1399 |
| mobile light | /app/sales?start=2026-11-24&end=2026-11-24&hour=2 (200) | 1/1 | 1 | none | 0 | 0 | 390/390 | 844 | 0/12 | 0 | 4 | 0/0 | 0 | 12/12 | 1402/1362/1372 -> 1372 |
| mobile dark | /app/sales?start=2026-11-24&end=2026-11-24&hour=2 (200) | 1/1 | 1 | none | 0 | 0 | 390/390 | 844 | 0/13 | 0 | 4 | 0/0 | 0 | 12/12 | 1344/1396/1365 -> 1365 |

Controls under 24px, desktop light: a "Skip to content" 1x1; button "Toggle Sidebar" 16x800

Controls under 24px, desktop dark: a "Skip to content" 1x1; button "Toggle Sidebar" 16x800

## books: `/app/books`

| viewport/theme | final URL (status) | main/h1 | headings | heading skips | console err+warn | CLS | overflow sw/cw | doc height | contrast fails/styles | <24px | <44px | no-name ctl/pbar | img no alt | focus ring visible | load ms (runs) median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop light | /app/books (200) | 1/1 | 122222 | none | 4 | 0 | 1280/1280 | 1605 | 1/38 | 3 | n/a | 0/0 | 0 | 12/12 | 1419/1296/1245 -> 1296 |
| desktop dark | /app/books (200) | 1/1 | 122222 | none | 4 | 0 | 1280/1280 | 1605 | 1/39 | 3 | n/a | 0/0 | 0 | 12/12 | 1285/1295/1436 -> 1295 |
| mobile light | /app/books (200) | 1/1 | 122222 | none | 4 | 0 | 390/390 | 3158 | 1/38 | 2 | 0 | 0/0 | 0 | 12/12 | 1424/1361/2098 -> 1424 |
| mobile dark | /app/books (200) | 1/1 | 122222 | none | 4 | 0 | 390/390 | 3158 | 1/39 | 2 | 0 | 0/0 | 0 | 12/12 | 1434/1306/1484 -> 1434 |

Contrast failures, desktop light:
- 2.15:1, 12px/400, fg(245,158,11) on bg(255,255,255), x1, "COGS"

Controls under 24px, desktop light: a "Skip to content" 1x1; button "Toggle Sidebar" 16x800; a "Set your tax rate" 90.1x14

Console, desktop light: warning: The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and hei

Contrast failures, desktop dark:
- 3.63:1, 12px/400, fg(225,29,72) on bg(19,28,46), x2, "Labor"

Controls under 24px, desktop dark: a "Skip to content" 1x1; button "Toggle Sidebar" 16x800; a "Set your tax rate" 90.1x14

Console, desktop dark: warning: The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and hei

Contrast failures, mobile light:
- 2.15:1, 12px/400, fg(245,158,11) on bg(255,255,255), x1, "COGS"

Controls under 24px, mobile light: a "Set your tax rate" 90.1x14; a "Set your tax rate" 89.4x14

Console, mobile light: warning: The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and hei

Contrast failures, mobile dark:
- 3.63:1, 12px/400, fg(225,29,72) on bg(19,28,46), x2, "Labor"

Controls under 24px, mobile dark: a "Set your tax rate" 90.1x14; a "Set your tax rate" 89.4x14

Console, mobile dark: warning: The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and hei

## Failures worth fixing, ranked by screens affected (of 7)

**contrast**
- 1 screens: 225,113,0 on 242,245,249 14px (payroll-week)
- 1 screens: 225,113,0 on 248,250,252 14px (payroll-week)
- 1 screens: 225,113,0 on 255,255,255 14px (payroll-week)
- 1 screens: 255,255,255 on 0,153,102 14px (payroll-review)
- 1 screens: 142,151,164 on 248,250,252 12px (inventory)
- 1 screens: 96,109,131 on 11,18,32 12px (inventory)
- 1 screens: 145,153,165 on 255,255,255 12px (inventory)
- 1 screens: 99,113,137 on 19,28,46 12px (inventory)
- 1 screens: 230,114,115 on 245,228,230 12px (shipments)
- 1 screens: 142,151,164 on 248,250,252 14px (shipments)
- 1 screens: 117,135,184 on 248,250,252 14px (shipments)
- 1 screens: 172,83,87 on 59,37,49 12px (shipments)

**small**
- 7 screens: <24 a "Skip to content" (payroll-week, payroll-day, payroll-review, inventory, shipments, sales, books)
- 7 screens: <24 button "Toggle Sidebar" (payroll-week, payroll-day, payroll-review, inventory, shipments, sales, books)
- 6 screens: mobile <44 targets (payroll-week, payroll-day, payroll-review, inventory, shipments, sales)
- 1 screens: <24 button "Show each night for Ka" (payroll-week)
- 1 screens: <24 button "Show each night for We" (payroll-week)
- 1 screens: <24 a "Back" (payroll-review)
- 1 screens: <24 a "Payroll" (payroll-review)
- 1 screens: <24 a "This week" (payroll-review)
- 1 screens: <24 input[type=text] "" (inventory)
- 1 screens: <24 a "Set your tax rate" (books)

**noname**
- 1 screens: textarea "Paste your full Z repo" (payroll-week)
- 1 screens: textarea "Paste your Employee Wo" (payroll-week)
- 1 screens: input[type=date] "" (payroll-day)
- 1 screens: input[type=text] "Search items…" (inventory)
- 1 screens: input[type=text] "" (inventory)

**cons**
- 2 screens: warning: The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and hei (payroll-week, books)

