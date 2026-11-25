# First-customer onboarding checklist (2Touch bar)

Date: 2026-11-25. Branch `rebuild/foundation`. Written for the founder, who does the first installs in person. Drafted from the repo as it is today, not from any install at a stranger's bar: none has happened. Documents only; nothing here was run.

**How to read the labels.** HYPOTHESIS: a belief nobody has measured; every duration below is one, with a cheap test (time the founder's own bar's install and each step, write the real figure in the "measured" column of section 14). UNVERIFIED: not confirmed from the code. TODO(owner): only the owner can fill it. Do not tell a customer any install time before section 14 has real figures.

**What "done" means for the whole job (the strategy's activation moment):** the bar's own first Z report has synced from its own POS, AND its first pay run has been approved by an owner (`docs/go-to-market/strategy.md` sections 1 and 7). Stock is not part of it.

---

## 0. Read this first: the gate and the real login path

**Do not install at a stranger's bar until the strategy's gates are met** (strategy section 8: Payroll Review approval screen, role fix A1 on live, the two real-data tips checks, the open doors on `/api/poll-2touch` and the cron route). Section 13 lists the gaps.

**How a new owner actually gets a login (verified in the code, 2026-11-25).**

- `/login` (`app/(auth)/login/`) offers a password form, an "email me a login link" (magic link) and the demo button. It has no "create account" link.
- `/join` (`app/(auth)/join/`) is **staff** sign-up only. It needs the bar's staff join code, calls `supabase.auth.signUp`, and files a pending claim a manager must approve. It never creates an organization.
- Inside an existing bar, an owner can add a person with a temporary password (`app/(app)/app/settings/team-actions.ts`, uses `auth.admin.createUser`, owner-only). That needs a bar to exist already.
- `/setup` (`app/(app)/setup/`) creates the organization, the owner membership and the terms-acceptance record, but only for an **already signed-in** user (`createOrgWithSettings` throws "Not authenticated" otherwise). `getCurrentOrg()` sends a signed-in user with no membership to `/setup`.
- **So there is no public owner sign-up screen.** The only routes by which a stranger's owner can reach `/setup` are: (a) the magic link, which creates the account only if the Supabase project allows new users to sign up (UNVERIFIED: a dashboard setting, not in the repo; the form deliberately says "if that email has an account" either way), or (b) the founder creates the user in the Supabase dashboard (Authentication, Users) with the owner's email and sets a password or sends a link, UNVERIFIED as a tested path. Note the `/join` path calls `signUp` for anyone holding a code, which suggests email sign-up is enabled on the live project; if so, anyone who signs up and has no claim also lands on `/setup` and can create a bar. Check the Supabase setting before relying on either reading.
- **Recommended for the first ten, pending a decision:** the founder creates the owner's account and walks through `/setup` at the bar, signed in as that owner. Record in section 14 which path was actually used and what happened. Gap logged in section 13.

---

## 1. Before the visit (founder, at a desk, one to two phone calls or messages)

Duration: HYPOTHESIS, not measured.

Collect the answers on the form in section 15. Why each one matters:

| Ask | Why (what breaks without it) |
|---|---|
| Is the POS 2Touch, and which version and install? Is the POS PC the one with SQL Server on it? | The agent reads the local SQL Server over shared memory (`2touch-agent-dotnet/README.md`, top). A cloud-only or remote database cannot be read by this agent. UNVERIFIED how many 2Touch installs fit. |
| Does the bar own its 2Touch outright, and who can say we may read its database? | Whether a bar's licence allows a third-party reader is UNVERIFIED; CONFIRM WITH COUNSEL (strategy section 3, risk 2). Get the owner's written yes to the install. |
| Windows version on the POS PC; is it the always-on machine? | The service runs on that PC. If it is off overnight the strip goes amber (stale after 60 min of silence) and sales are missing until it is on. |
| Who holds Administrator rights on that PC? | Setup and every update step need an elevated prompt (README, "Other invocations"). A UAC prompt cannot be skipped. |
| Is there outbound internet on that PC? | The agent only makes outbound HTTPS to Rail (README, Security). A firewall that blocks it makes every sync fail. `rail-setup.exe --diagnose` section 3 tests DNS, TCP and a signed empty ingest. |
| Is a keyboard and mouse on that PC working? | If not, use the no-keyboard USB path (README, "No keyboard on the POS box"). |
| Who is the owner and who approves pay? Is it the same person? Their email. | Only an owner can approve a pay run and download the bank file. A manager is not enough (`lib/payroll/open-run.ts`). The owner also needs the `/setup` login (section 0). |
| Who are the staff, by role? | Needed to create employees and to match names from the POS. |
| Pay frequency (weekly, every two weeks, twice a month, monthly). | `tax-setup-panel.tsx` lists exactly these four. The owner must pick one; there is deliberately no silent default. |
| Tip rules today, per person: pooled by hours, each keeps own, by sales share, barback cut, nobody. How is the cash jar counted and by whom? | These map to the five tip modes (`pool`, `individual`, `sales_pct`, `barback`, `no_tip`; `employee-setup-dialog.tsx`). Cash tips are typed in by a person; 2Touch reports 0 for nearly every bar (AGENTS.md). |
| Opener bonus: none, fixed per shift, percent of pool, or extra paid hours? | Four types in Settings, Tip and Pay (`tip-pay-tab.tsx`). Fixed and percent come out of the tip pool; extra hours are paid by the bar. |
| Barback cut: percent, how it divides between barbacks (by hours or equal), any tiers? | Settings, Tip and Pay, Barback dialog. |
| Hourly rate per role; overtime premium or not. | Same tab. |
| Tax settings: does the owner expect Rail to withhold? | Rail does not file or withhold. The withholding code is unchecked against official tables and switched off (AGENTS.md; strategy section 2). Say so plainly; the bar's accountant or payroll provider keeps that job. |
| Does the bank take a NACHA file? Routing and account details are the owner's to enter, not yours. | The bank file is a hand-off the bar's own bank processes. Rail never moves funds (`/terms`). Note: the bank routing field currently accepts any digits (see section 13). |
| Last night's Z report on paper or screen, and how last night's tips were split (ask to be shown). | The discovery question from the strategy, and the number you will compare against at the first sync. |
| Suppliers and reps: names, which items from whom, email or text. | For the rep setup in section 10. |
| Closing time and a typical late night. | The trading day cutoff is 4am by default (README, "The trading day"). A bar trading past 4am needs the cutoff raised. |

---

## 2. Account and organization creation (founder with the owner, at the bar or on a screen share)

Who: founder drives, owner present and signed in as themselves. Duration: HYPOTHESIS. The page itself says "Takes about a minute"; that is the page's claim and is not measured, do not repeat it.

1. Get the owner signed in (section 0). On `/login` use the password or the magic-link route.
2. If the owner has no bar yet they land on `/setup` ("Set up your bar", step 1 of 2). Fill: bar name (required), type, state, city; tip pool split percent and barback pool allocation; default hourly rate per role; inventory defaults (pour size). Tick the Terms of Service box (the button stays disabled and the server refuses without it).
3. The bar type list includes restaurant, hotel and brewery. The strategy targets bars only; choose Bar / Tavern or Sports Bar for the first ten.
4. Submit. The server creates the organization, the owner membership, seeds seven inventory categories (Spirits, Beer, Wine, Mixers and Sodas, Coolers and Seltzers, Supplies, Garnishes and Food) and two placeholder reps ("Your Spirits Rep", "Your Beer / Beverage Rep"), and records the terms acceptance.
5. Step 2 is `/setup/pos`: choose **2TouchPOS**. (Clover and Toast cards also appear; Toast is not claimed, strategy section 2.) After this `/setup/pos` redirects to the dashboard once a provider is set.

**Done looks like:** the owner sees the dashboard with their bar's name; Settings, General shows the bar. **Pitfalls:** the setup form's wage and tip defaults are guesses (15 percent, $15 an hour and so on); the real values come in section 8. A second `/setup` run by the same user creates a second organization, so do not submit twice (UNVERIFIED whether a guard exists).

---

## 3. Installing the agent at the bar (founder, on the POS PC)

Who: founder, with the owner's permission, Administrator access. Duration: HYPOTHESIS; time it at the founder's own bar and write the figure in section 14. Nothing here may be promised to a customer as quick.

**What to bring.** `rail-setup.exe`, `rail-2touch-agent.exe`, `rail-update.exe`, `rail-uninstall.exe`, and `rail-diagnose.exe` for trouble, all from the current published build (README, Setup 1 and 2). Rebuilding them is a build-machine job and is not part of a visit. Which release is current is whatever `AGENT_LATEST_VERSION` says on Vercel; UNVERIFIED whether the files are hosted anywhere a founder can download from today.

**Get the pairing code.** In Rail: Settings, POS Integration, 2TouchPOS. Save the config, then use "Copy pairing code" (one line starting `RAIL1-`; it carries the org id, that bar's token and the Rail URL). It is a live credential: do not paste it into chat, email or a photo. One USB stick per bar, wiped after, if using the unattended path.

**Run the wizard.** Double-click `rail-setup.exe`, choose 1, Install (README, Setup 3). It walks twelve stages: pair, find SQL Server, grant read access, discover the schema, preview data, install the service, send one real sync.

- Stage 2 pairing code: paste it.
- Stage 4 and 5: the SQL instance and database (exact `TwoTouch`, else one containing "2touch"). Two candidates stops the unattended path.
- Stage 6 read access: Windows authentication; the service runs as LocalSystem with `NT AUTHORITY\SYSTEM` granted `db_datareader`. A non-sysadmin operator cannot finish this stage; ask the bar's 2Touch administrator.
- Stage 7 schema (section 4 of this checklist).
- Stage 12 prints the confirmed mapping as JSON. Save it in your visit notes (it holds no secret, check before pasting anywhere).

**What the install does for you.** It writes to `C:\rail-agent`, locks the directory to Administrators and SYSTEM (users may only read and run), registers the daily 03:30 Scheduled Task as SYSTEM running `rail-update.exe --yes`, and copies `rail-update.exe` and `rail-uninstall.exe` beside the agent (README; AGENTS.md "Hardening" and "ScheduledTask").

**Check it took.**

- Run `icacls C:\rail-agent`: Administrators and SYSTEM show `(F)`, `BUILTIN\Users` shows `(RX)`, and there is no Authenticated Users entry (README, "Install directory permissions"). If Authenticated Users is still listed, run `C:\rail-agent\rail-update.exe --harden` from an elevated prompt. Pitfall: a standard user can pre-create `C:\rail-agent` before setup (AGENTS.md); if the folder already existed, check the owner and for unfamiliar files, and stop and look if hardening refuses (a reparse point or hard link is the sign of a pre-staged folder). Never delete unfamiliar files to "tidy": `rail-2touch-agent.exe.bak` is the only rollback.
- Run `schtasks /Query /TN "Rail 2Touch agent update"` to confirm the task exists. A box installed with an older wizard has no task: `cd C:\rail-agent` then `.\rail-update.exe --install-task`, run from the install directory, never from Downloads. Without the task nothing ever updates the box (AGENTS.md: publishing a release moves no box).
- Run `.\rail-2touch-agent.exe --version` (elevated) and note it.

**Done looks like:** setup finishes with a real sync sent; Windows Services lists the Rail agent running; in Rail, Settings, POS Integration shows "Agent version" and "last sync" (written from the `X-Rail-Agent` header on each sync). **Do not leave the bar until section 5 shows data.**

**Pitfalls:** the first SQL connection unpacks a native library to `%TEMP%\.net\`; an antivirus scan can stall the wizard silently, run `rail-diagnose.exe` section 5 if it hangs. UAC always prompts, and AutoRun is disabled on removable drives, so even the USB path needs a double-click. Run every other tool from an elevated prompt or it fails reading the config with an access-denied that looks like a config fault.

**If the PC has no usable agent path** (cloud-only, no admin, no internet): use the email fallback, UNVERIFIED as a first-customer path. In 2Touch Cloud, set the nightly Z report to email to the Gmail inbox named in the POS panel; Rail checks it every 15 minutes in the panel's own words, and the daily cron (`/api/cron/2touch`, 13:00 UTC) is the other fallback. This gives Z reports only, not the five-minute feeds.

---

## 4. Schema mapping and the profile migration (founder, wizard stage 7)

Duration: HYPOTHESIS.

- **Recognised 2Touch schema (the normal case):** the wizard offers a built-in mapping; press Enter. It maps three feeds from the tables named in the README table "Schema mapping". It proves each with a `TOP 5` run before writing.
- **Unrecognised schema:** discovery scores tables and proposes columns. A column flagged `guess: name gives no clue, check this` must be checked by a person. An unattended run skips and names feeds it cannot cover rather than guessing.
- **Skipped feeds** send an empty array on purpose. An empty feed is not a healthy feed: see section 5.
- **Profile migration.** `rail-update.exe` replaces the binary only. A feed added in a newer release reaches an existing bar's config only through `ProfileMigration`, which recognises the exact text of a wizard-written 2Touch Z source in two eras (pre-1.0.0 and the six-column one since 1.0.2). It fills a blank feed, never replaces a non-empty one, and does not rewrite the file on disk. A hand-edited mapping is never touched; re-running `rail-setup.exe --setup` is the only way to get new feeds onto it.
- **Business date.** Default cutoff is 4am: a drink at 01:40 Sunday counts toward Saturday. Confirm with the owner that no real session straddles 4am. Check on stage 7 which feeds the cutoff reaches (`DateHasTime`). A date-only column must have cutoff 0 or every night moves a day early.
- **Re-running setup is the supported fix** for a bad mapping; it stops the service, rewrites config and restarts, no uninstall needed.
- **Backfill is not automatic.** Mapping a feed does not add the nights that passed. History comes only from `rail-2touch-agent.exe --backfill --from --to --feeds ...` on the POS box, never `--once --days 365`. `--feeds` has no default. **Never backfill `items` without the owner understanding it restates inventory for every night in range** (AGENTS.md). Not part of week one.

**Done looks like:** stage 7 shows the mapping with sample rows for Z report, EW report and item audit.

---

## 5. The first sync and the sync-health strip (founder, then owner)

The service syncs on start and then every 5 minutes (README). The strip is computed by `lib/pos/sync-health.ts`. What each state means and what to do:

| Strip | Rule in the code | What to do |
|---|---|---|
| Healthy ("Syncing normally, last checked in ...") | Checked in under 60 minutes ago, no errors, and the last sync carried something. | Not yet proof. Open the dashboard and compare a real night to the paper Z report. Green means "moved something", not "moved the right thing". |
| No data (amber) | Checking in on time, no errors, and the summary shows no sales, hours or items. | A bar closed for two days looks the same as a dead feed. If the bar was open, run `.\rail-2touch-agent.exe --test` (prints samples, sends nothing) and `rail-diagnose.exe` sections 8 to 10 (row counts and whether the date columns are indexed). A summary that is absent means "cannot say", not "nothing moved": an old agent must not alarm. |
| Errors | The last sync reported errors; they are shown, prefixed `agent:` when they came from the agent. | Read them. A feed that fails is caught per feed so the other feeds still arrive: partial data is applied. |
| Stale | Nothing heard for 60 minutes or more. | Normal if the POS is off. Otherwise check the service is running and the internet is up. |
| Down | Never checked in, or silent for 12 hours or more. | Sales and hours since then are missing. Check section 12. |
| Not configured | No agent token or provider is not 2Touch. | Not a fault for a non-2Touch bar. |

**Known silent failure (AGENTS.md):** a sync that moved nothing is not healthy. One bar ran a month green with no sales. So at the first sync, do all of these before leaving: (1) the dashboard shows last night's Z with sales and tips; (2) it equals the paper Z within the owner's tolerance; (3) hours appear in Payroll for the people who clocked in; (4) the strip says Healthy rather than No data.

**Never trust "current agent version" as proof of health, and never trust a bar to be on the latest release:** being behind looks exactly like being current. The Scheduled Task (section 3) is what delivers updates.

**Done looks like:** the founder can show the owner a real night in Rail that matches the owner's own Z report. Duration to first synced Z: HYPOTHESIS; the strategy's target ("same day") is also a hypothesis.

---

## 6. Cash tips: the one figure only a person enters

Who: the manager who counts the jar. The POS reports 0 cash tips for nearly every bar. The payroll close screen (`payroll/cash-actions.ts`) stores a hand-entered figure with source `manual`, which every later POS sync must not overwrite. Show the owner how to enter the jar count for the first night and that it stays.

---

## 7. Staff, roles and tip modes (founder with owner)

Duration: HYPOTHESIS, depends on head count.

Open Payroll, Employees. Add each person with a role (bartender, barback, server, security, manager, other), a pay rate and a tip mode (`employee-setup-dialog.tsx`):

| Mode | Meaning (from the screen) |
|---|---|
| pool | Tips pooled and shared in proportion to hours worked. |
| individual | Each keeps their own tracked tips; needs per-employee tip data in the Z imports. |
| sales_pct | Shared by each person's share of sales from the Z report. |
| barback | Takes the barback cut of the night's pool; size and split set in Settings, Tip and Pay. |
| no_tip | Excluded from all tip calculations. |

Then in Settings, Tip and Pay: tip pool split, barback share and method, opener bonus, hourly rates per role, overtime premium. Set pay frequency in the tax panel (`/app/tax`) and leave tax withholding off.

**Staff match.** POS names must match employee names for shifts to attach. After the first sync, list who clocked in, and fix any who did not match. A name typed differently on the staff login (the `/join` claim) is matched by name and an ambiguous match waits for a manager to choose. Optional: give staff a join code and approve claims from Payroll, Employees; not needed for week one.

**Pitfalls:** deleting an employee shows "removed" while the row may remain on reload (P1 #3 in `2026-11-25-for-owner-p0-p1.md`); do not delete in front of an owner, deactivate instead if available. The bank routing number accepts any digits (P1 #4); check each digit yourself.

**Done looks like:** every person who worked last week appears in Payroll with the right rate and mode, and the owner agrees with each line on the first day view.

---

## 8. First Z report, first tip split, first pay run (owner present)

Duration: HYPOTHESIS. The strategy's target is a first approved pay run within 14 days of the first Z (a hypothesis).

1. **First Z report.** Dashboard or Sales: last night's sales and tips are present and match the paper Z.
2. **First tip split.** Payroll, day view for that night. Compare to how the owner split tips by hand; walk through each person's number. Individual mode, barback cut and opener bonus change the answer; if a figure disagrees, find out which setting differs before anything is approved. Known check still outstanding on real data: payroll tips exceeded Z tips on the demo bar and was fixed 2026-11-25 (`for-owner-p0-p1.md`, update), but the strategy's two real-data tip checks have not been done. Treat the first real bar as the check, and compare every cent.
3. **Submit the pay run** (Payroll, week, Run payroll). It freezes a snapshot of the figures. Submitting notifies the owner and shows an open-run banner across Payroll.
4. **Owner reviews and approves** at `/app/payroll/review`. Approval is an owner-only act. Watch for the pitfalls in section 13: the "Confirm Payroll" button there saves nothing and is not the approval; the Approved badge sits over figures that keep recalculating.
5. **Pay out.** "Pay remaining N" pays balances once; a sub-cent leftover can leave the bar showing "5 of 7 paid" (P1 #1). The bank file (NACHA) is locked until approval; an owner may override but must write down why. The bar's own bank moves the money.

**Done looks like (the activation moment):** a pay run in status approved by the owner, built on a Z report that came from the bar's own POS. Write the date in section 14.

---

## 9. Inventory: deliberately not week one

Offered only after the first approved pay run (strategy section 3). **Rail does not give accurate stock until each item has a container size and either a pour size or a recipe.** The 2Touch item audit creates a stock row for every POS item name, and without sizes a spirit removes a whole bottle per shot and a cocktail removes a phantom unit (`lib/pos/setup-gaps.ts`). Do not promise accurate stock before this is done.

When the owner is ready:

1. Inventory, Stock Tracking Setup (`/app/inventory/setup`) lists every drink sold in the window and what is wrong: unmapped, needs pour size, needs recipe, needs keg size. Work it down by units sold.
2. Import items from CSV (Inventory import dialog) or Settings, Import Data; set category, container size (ml), cost price, par level, supplier.
3. Pour sizes: item, then category, then the org default from setup (1.5 oz). Recipes and deals are in Stock Tracking Setup below the report; exclusions are applied before bundles.
4. Enter deliveries as shipments, using the invoice's price. A delivery's cost is recorded as `unit_cost`; items valued before shipments existed fall back to `cost_price`.
5. Do a first count or weigh session to set real starting stock.

**Known display problems:** Books shows 0.0 percent pour cost and 87.4 percent profit when no cost data exists, so a new bar's Books page can look excellent for the wrong reason (critique summary, issue 1; section 13). The Low and In Stock filter chips do not filter. A voided shipment can look live.

---

## 10. Supplier and rep setup

Who: owner or manager. The setup seeds two placeholder reps. Edit them (`/app/reps`), add name, company, phone and email for each real rep, attach items to suppliers, then send a first order by email or text (orders go through Gmail and Twilio, `.env` names only: both must be configured on the live deployment). Pitfall: do not use Rail's number for anything but the product; ask the rep's consent practice with the owner. Do not offer a rep anything for an introduction until counsel answers (strategy section 5). Duration: HYPOTHESIS.

---

## 11. Notifications and staff login (optional, day 1 to 7)

Settings, Notifications: low stock, nightly sales, sales anomaly, and the pay-run-awaiting-approval alert. Missing rows mean role defaults. Push needs three VAPID keys on the server; without them only the in-app bell works. Staff logins at `/join` with the bar's join code are optional.

---

## 12. When it fails: how to look (founder, remote or on site)

The agent's own log is the **Windows Event Log on a box behind a bar. Nobody reads it.** The visible symptom is only the Rail strip. To check, on the POS PC, elevated:

1. Event Viewer, Windows Logs, Application, source `Rail2TouchSync`. Or in PowerShell: `Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='Rail2TouchSync'} -MaxEvents 30 | Format-List TimeCreated, LevelDisplayName, Message`. Look for Error entries naming a failing feed. The `Start` and `Stop` lines written by Windows itself prove nothing about the agent.
2. A "Sync complete" line proves a sync ran; it does not prove the data is right. Compare to the paper Z.
3. Run `rail-diagnose.exe` (double-click; no flags or prompts; writes `rail-diagnose-<timestamp>.txt` and opens it). It changes nothing and is safe at any time. Exit 0 means nothing failed. Email the text file to yourself.
4. `.\rail-2touch-agent.exe --test` prints sample rows and sends nothing; `--once` sends one real sync.
5. Service stopped: start it in Services, or `sc.exe` by full path. Never launch a Windows tool by bare name from the install directory (AGENTS.md).
6. A bar closed for days shows No data or Stale and is indistinguishable from failure; ask the owner first.
7. Errors that mention a table or column: the schema mapping is wrong; re-run `rail-setup.exe --setup`.
8. Still stuck: do not edit `appsettings.local.json` by hand unless you know the key; it holds the token and SQL credentials.

---

## 13. Known gaps to fix before a stranger's bar

Drawn from `docs/superpowers/findings/critique/summary.md`, `2026-11-25-for-owner-p0-p1.md`, and strategy section 8. None of these was fixed by this document.

The five that most affect an install at a stranger's bar:

1. **No way for a new owner to get a login.** There is no public owner sign-up, the magic-link path depends on a Supabase setting not in the repo, and the dashboard-created user path is untested. The founder must create the account by hand, and the `/join` flow suggests sign-up is open on live (check). (Strategy section 10, item 7.)
2. **Payroll Review is not trustworthy as an approval.** A "Confirm Payroll" button saves nothing next to the real Approve and the bank download; the Approved badge sits on live recomputed figures and the snapshot diff runs only while pending; the panel shows no approver, date or total (critique, P0). This is the activation event itself.
3. **Tips and roles unchecked on real data.** The role fix A1 (a manager treated as owner could approve pay and export the bank file) needs confirming on live, six tables with row security off need checking, and the two real-data tips checks are not done (strategy section 8, items 2 and 3).
4. **Silence shown as zero.** Books shows 0.0 percent pour cost and 87.4 percent profit with no costs entered; Sales shows $0.00 and every item "Never sold"; Inventory says "No items yet" for a search with no matches and reports $0.00 of stock. A new bar sees exactly this on day one (critique issue 1; strategy items 5 and 6).
5. **Front-page promises the onboarding cannot keep.** The setup page says "about a minute"; the site says "up and running in minutes" and "under an hour", names Toast, and promises export and deletion that no code was found to keep. Nothing is installed by a visitor alone (strategy section 2).

Other gaps seen while writing this:

- Open doors: any signed-in user can trigger the cross-bar mailbox poll; the cron route is open if `CRON_SECRET` is unset (strategy item 7).
- Delete employee reports success and the row remains (P1 #3). Bank routing number accepts any digits and blank (P1 #4). Pay-remaining can leave a one-cent residue (P1 #1).
- Payroll day view on a phone: rows overlap and the Opener switch renders as a large circle (critique issue 3); the owner closes the night on a phone.
- No setup checklist screen in the app for a new bar (strategy item 10); this document is the stand-in.
- Pay-run, Books and Payroll hidden assumptions: Books cost fallback, labor basis and per-month labor spread are invisible; day labels do not state their base (critique issue 6).
- Dev environment secrets handling: keys in `.env.local` were printed once in a walk session; rotate (P1 #5). Not an onboarding step, but a gate.
- Where the agent binaries are hosted for a field download, and whether the manifest variables are set (`AGENT_LATEST_VERSION`, `AGENT_DOWNLOAD_URL`, `AGENT_SHA256`): UNVERIFIED. Until set, the manifest returns 204 and every box reads "you are current".
- Hosting plan commercial use (Vercel Hobby): UNVERIFIED, owner step.
- No data export or account closure. Backup of a customer's data in Supabase is the owner's plan setting, UNVERIFIED.

---

## 14. After install: day 1, day 7, day 14, backup and rollback

Fill the "measured" column with real figures; leave "HYPOTHESIS" until then.

| When | Check | Who | Done looks like | Measured |
|---|---|---|---|---|
| Day 1 (same night) | Strip Healthy, not No data; last night's Z matches paper; hours for tonight's shifts appear; scheduled task exists; `icacls` clean | Founder | Section 5 four checks pass | |
| Day 1 | Cash tip jar entered for tonight, and still there after the next sync | Manager | Figure unchanged 10 minutes later (HYPOTHESIS for the wait) | |
| Day 2 to 3 | Tip split for each night matches the owner's own working | Founder, owner | No unexplained difference | |
| Day 7 | Strip Healthy every day; agent version matches the current release (it will lag unless the task ran); a closed night shows No data and the owner knows why; staff matched | Founder | Seven nights of Z; zero wrong money figures found by the owner | |
| Day 7 | First pay run submitted | Founder with owner | Run status pending, banner shown | |
| Day 14 | First pay run approved by the owner (activation); bank file downloaded after approval | Owner | Approved run, no override | |
| Day 14 | 20-minute call with the owner; ask what they still do by hand | Founder | Notes in the metrics sheet | |

**Backup.**

- The agent holds no data of its own beyond `C:\rail-agent` files. `appsettings.local.json` contains the agent token and SQL credentials: do not copy it to a USB stick or a cloud folder; if lost, re-pair with a fresh pairing code from Rail (Settings, POS Integration) and re-run setup.
- Save the stage 12 mapping JSON and the latest `rail-diagnose` report in your visit notes.
- Keep `rail-2touch-agent.exe.bak` in place; it is the only rollback.
- Rail's own database backups and any data export are UNVERIFIED (section 13). Do not say a bar's data is backed up until the owner has confirmed the Supabase plan.

**Roll back the agent.** From an elevated prompt in `C:\rail-agent`: `.\rail-update.exe --rollback`. It restores the `.bak` (the version before the last successful update) and restarts the service. A new build that fails to start is rolled back automatically by the updater. To stop automatic updates: `.\rail-update.exe --remove-task`. To report availability without installing: `.\rail-update.exe --check` (exit 10 means an update exists). To pull the agent entirely: `rail-uninstall.exe` (removes service, config, credentials and the task).

---

## 15. Owner inputs to collect (one page; blanks, no customer invented)

```
Bar name (as it will appear): ____________________   City / State: __________
Owner name and email (for the login): ____________________   Mobile (optional): __________
Who approves pay (if not the owner): ____________________
Written OK from the owner to install and read the POS database: yes / no   Date: ______

POS: 2Touch   Version: ________   Owned outright? yes / no
POS PC: Windows version ______   Always on? yes / no   Admin account holder: __________
Internet on that PC: yes / no     Keyboard and mouse working: yes / no
Date and time window for the install (bar closed or quiet): __________

Hours open (open / close, and latest typical close): ______ / ______
Trading-day cutoff OK at 4am? yes / no     Raise to: ______

Pay frequency: weekly / every two weeks / twice a month / monthly   First pay date: ______
Bank takes NACHA: yes / no     Bank details entered by the owner (not the founder): yes / no
Tax withholding wanted from Rail: Rail does not do this. Who does it: __________

STAFF (one line each)
Name | Role | Hourly rate | Tip mode (pool / individual / sales % / barback / none) | Opener? | Notes
____ | ____ | ______ | ______ | ____ | ____
____ | ____ | ______ | ______ | ____ | ____
____ | ____ | ______ | ______ | ____ | ____
____ | ____ | ______ | ______ | ____ | ____

TIPS
How tips are split today: ______________________________
Who counts the cash jar, and when: ______________________
Opener bonus: none / fixed $____ / ____% of pool / ____ extra hours
Barback cut: ____%   Split between barbacks: by hours / equal   Tiers: yes / no
Overtime premium: yes / no   Multiplier: ____

Last night's paper Z total: $______   Tips as split by hand: __________ (keep to compare)

SUPPLIERS (one line each)
Company | Rep name | Email or text | What they supply | Order days
____ | ____ | ____ | ____ | ____

INVENTORY (week one: none; later)
Wants stock tracking after the first approved pay run: yes / no   Count day: ______
Standard pour size (oz): ____   Items needing recipes: __________

FOUNDER'S NOTES AFTER THE VISIT
Login path used: ______   Install time (measured): ______   First synced Z date: ______
First pay run approved date: ______   Problems: ______________________________
```

---

## Unverified

1. Whether the live Supabase project allows new email sign-ups (decides whether the magic link creates an owner account).
2. That the founder-creates-the-user route works end to end through to `/setup`.
3. Where the agent binaries are hosted for download, and that the three manifest variables are set on Vercel.
4. The exact page the owner lands on after choosing 2TouchPOS in `/setup/pos` (the redirect is in the client component, not read).
5. Whether a second submit of `/setup` creates a second organization.
6. Whether a bar's 2Touch licence allows a third-party reader (counsel).
7. The email-fallback path as a first-customer route.
8. Every duration in this file. No install has been timed.
9. Rail's data backup and export; commercial-use hosting plan.
10. The 15-minute email poll interval is quoted from the POS panel text, not tested.

## Sources (all inside the repo, read 2026-11-25)

`docs/go-to-market/strategy.md`; `docs/superpowers/findings/2026-11-25-gtm-manager-plan.md`; `AGENTS.md`; `2touch-agent-dotnet/README.md`; `docs/superpowers/findings/critique/summary.md`; `docs/superpowers/findings/2026-11-25-for-owner-p0-p1.md`; `docs/superpowers/findings/2026-11-24-dev-setup.md`; `app/(auth)/login/*`, `app/(auth)/join/*`; `app/(app)/setup/*` and `setup/pos/*`; `app/(app)/app/settings/page.tsx`, `_components/pos-panel.tsx`, `tip-pay-tab.tsx`, `team-actions.ts`; `app/(app)/app/payroll/_components/employee-setup-dialog.tsx`, `tax-setup-panel.tsx`; `app/(app)/app/inventory/setup/page.tsx`; `lib/pos/sync-health.ts`, `lib/pos/setup-gaps.ts`; `lib/org.ts`.
