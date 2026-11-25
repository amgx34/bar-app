# Positioning and ideal customer (G2)

Date: 2026-11-25. Branch `rebuild/foundation`. Drafted for the owner and the manager's review. Documents only: nothing here is on a page, sent or posted.

**How every claim is tagged.** A tag such as [B1] or [A27] points to a row in `docs/go-to-market/claims-register.md`. Only rows that are TRUE, or approved with limits, are used as claims. HYPOTHESIS means a belief nobody has tested; each comes with a cheap test. UNVERIFIED means not confirmed. No customer, saving, setup time or testimonial exists on record, and none appears here. The founder's bar is called "the founder's own bar".

**Read this first (two minutes).** Section 1 is the checklist to tick in a conversation. Section 4 is the positioning and the promise lines. Section 6 is the do and don't list. Everything after is reference.

---

## 1. The ideal first customer (tick it in the conversation)

Beachhead, from strategy decision 1: an independent, single-location bar on 2Touch near Cincinnati and Northern Kentucky, where the owner or one manager works out tips and pay by hand after close.

| # | Trait | How to check it (ask or look) | Why it matters |
|---|---|---|---|
| 1 | One bar, one location, owner or one manager present | "Is this your only bar? Who closes it out?" | One organisation is one bar in Rail; there is no multi-location view [B2 limit]. |
| 2 | Runs 2Touch on a Windows PC at the bar | Look at the POS screen; ask who has the administrator login for that PC | The agent is a Windows service that needs an administrator install [B12, E1]. |
| 3 | Someone can give administrator rights and SQL access on the day | Ask "who can log in as administrator on that computer?" | Install needs it (README, onboarding checklist). |
| 4 | Tips and pay are worked out by hand today (paper, spreadsheet, calculator, memory) | "Show me how last night's tips were split." | The nightly close is what Rail leads with [B1]. |
| 5 | Tips are shared by a rule Rail has a mode for: pooled by hours, individual, or percent of sales, with or without a barback cut or opener bonus | Ask the rule in the owner's words; write it down | Those are the modes that exist [A15]. A rule outside them is a "not yet". |
| 6 | The owner can approve pay runs personally, or names one person who can | "Who signs off pay?" | An owner approves the run before the bank file unlocks [B6, limited]. |
| 7 | The bar's own bank can take a direct-deposit file, or the owner is fine paying by hand with Rail's figures | Ask how staff are paid today | Rail never holds or moves money [L2, B16]. |
| 8 | Within a short drive of the founder | Address | Installs are done in person (strategy decision 4). |
| 9 | Will give real nights of data and tell the founder when a figure looks wrong | Ask directly | The product is proven bar by bar; the founder's own bar is the only reference. |

**What hurts, as the owner will say it (HYPOTHESIS).** Tips are done late at night, by hand, and argued over; pay figures are not fully trusted; a Z report is read but never connected to the tip split. Test: in ten conversations, ask each owner to show last night's split. Count how many use paper or a spreadsheet, and write down how they describe the time and the arguments in their words. If fewer than half do it by hand, this ICP is wrong; see section 9.

### Anti-profile: do not sell to these yet

| Who | Why not yet |
|---|---|
| A bar on any POS other than 2Touch (or a Clover bar that did not ask) | No other feed is claimable [PRODUCT.md; A20 UNSUPPORTED]. A nearby Clover bar that asks is accepted, not sought. |
| A bar wanting Rail to file or withhold payroll tax | Rail does not file, withhold or remit tax [L1]. |
| A bar wanting Rail to move money or pay staff directly | Rail does not hold or move money [L2]. |
| Groups of two or more bars | One organisation is one bar; no bar switcher in the plan. |
| Restaurants, hotels, breweries, nightclubs | Venue types beyond bars are undecided [A35, PRODUCT.md]. |
| A bar with no way to run the Windows agent (no administrator, a Mac or tablet POS) | The email fallback exists [B12] but is weaker; treat as a later test, not a pilot. |
| A bar that wants scheduling | Not offered [B2 limit]. |
| A bar whose tip rule is unusual and unlisted | Rail cannot promise a mode it does not have; write the rule down for later. |
| A bar whose owner wants a fixed uptime or a savings guarantee | No uptime guarantee exists [L8]; no savings figure exists [A8]. |
| A bar that wants stock accurate in week one | Stock needs a container size and a pour size or recipe per item [B20]. Offer stock after the first approved pay run. |

---

## 2. The buyer and the user

HYPOTHESIS for the whole table: these are guesses from the product's own users note (`PRODUCT.md`: owner-operators and managers share screens; staff use a separate portal). Test: ask each person in the first conversations the question in the last column and record the exact words.

| Person | Role in Rail | What they care about (their words, to be confirmed) | What to ask |
|---|---|---|---|
| Owner | Buys, approves the pay run, sees the books | "Is the number right?" "Did I pay everyone correctly?" "I do not want to be the one doing this at 2 a.m." | "What is the last thing about close that went wrong?" |
| Manager | Does the close day to day, cannot approve a run | "Tell me what to enter." "Make it work on my phone behind the bar." "If it is wrong, show me why." | "Walk me through your close, from the Z report to the last tip." |
| Bartender or server | Sees own shifts and pay in a staff portal; not the buyer | "Where is my tip and how was it worked out?" | "What do you want to be able to check?" |

Rail's own principle supports the manager: a role that cannot approve still sees why a run is waiting (`PRODUCT.md` principle 5).

---

## 3. The problem, in the owner's language

Written to be read aloud. Every sentence is a question or a statement about what the owner does, not a claim about what Rail achieves.

> After the last customer leaves, you still have the night's close to do. You read the Z report. You work out how the tips split. You work out who gets what for the week. Then you hope you got it right, because the staff will check.
>
> If that is done by hand, it is done late, it is done tired, and when someone says "that is not what I made", you have nothing but your own working.

Tied to the product's nightly close: the Z report from 2Touch, the tip split, and the pay run, in that order [B1]. All of the above is HYPOTHESIS about how owners feel until the ten-conversation test is done. The register marks the front page's version of these pains as UNVERIFIED (A11 to A13), so do not state them as facts about "most bars". Ask them as questions.

---

## 4. Positioning and the one-line promise

### Positioning statement (internal)

For independent single-location bars on 2Touch whose owner or manager works out tips and pay by hand after close, Rail is one app for the whole bar [B2] that reads your 2Touch sales with a small program on the POS computer [A27, B12] and works out the night's tip split and pay run for you to check and approve [B1, limited]. It does not file taxes or hold your money [L1, L2]. We have not found another tool that does stock, tips and pay, nightly sales and rep orders together for one bar (competitor pages read 2026-11-25) [B3, UNVERIFIED until the dated re-read].

Category line (public, stays): "One app for the whole bar." [B2, owner-confirmed]
2Touch line (conversation only, owner to confirm per `PRODUCT.md`): "Rail reads your 2Touch Z report and works out the night's tip split and pay run for you to check and approve." [B1]

### Three message pillars (each with its proof)

| Pillar | Say | Proof | Limit to say beside it |
|---|---|---|---|
| 1. One app for the whole bar | "Stock, tips and pay, nightly sales and supplier orders in one place." | B2, A17, B8 | No scheduling, one bar per account, stock needs per-item setup first [B2 limit, B20]. |
| 2. It starts from the 2Touch you already run | "A small program on your POS computer reads your sales every few minutes. It reads; it does not write." | A27, B12, L6, E2 | Windows only, administrator install; conversation only until the owner approves the line. |
| 3. Figures you check and approve | "Rail works the night out; you check it and an owner approves it. It does not file taxes or hold your money." | A15, B7, L1, L2; B6 only after the Payroll Review fix | Never "correct", "accurate" or "reconciles" until the real-data checks are done [B5]. |

The 25-word version is the one-line intro in the table below (20 words).

### The one-line promise, by context

| Context | Line | Claims used |
|---|---|---|
| In person, to a 2Touch owner | "Show me how you split last night's tips. Rail reads your 2Touch Z report and works out the night's tip split and pay run for you to check and approve." | B1 (conversation only), A27 |
| One-line intro (a warm introduction, a text a friend forwards) | "Rail is one app for the whole bar: stock, tips and pay, sales and supplier orders, built for bar operators." | B2, A3 suggested wording |
| Email subject (only to someone who asked for an email, and only once a domain, mailbox and postal address exist: briefing 4.2; cold email waits for counsel, see G3) | "A demo bar to try: tips, pay and your Z report in one app" | A6, A43, B2 |
| Sign or card left on the bar | "Try a demo bar now. No signup, no credit card. Rail does not file taxes or hold your money." | A6, A43, L1, L2 |
| When someone asks "who else does this?" | "We have not found another tool that does stock, tips and pay, nightly sales and supplier orders together for one bar. We read competitor pages on 2026-11-25 and I will show you what I read." | B3 (UNVERIFIED until the dated re-read; use only with the date) |

Why no "set up in minutes": the register says setup time has never been measured [A25, A28]. The honest line is "we set it up with you" [A25 suggested wording], used only when the founder will in fact do it.

---

## 5. Proof points

**Real today**

| Proof | Claim | Limit to say beside it |
|---|---|---|
| A demo bar anyone can open from the website, no signup, no card | A6, A43, B10 | Sample data only [A42]. |
| The agent reads 2Touch with a read-only database login and does not write to the POS | L6, E2 | Windows, administrator install. |
| A pay run is frozen when submitted, an owner approves it, and the bank file is locked until approval unless an owner overrides and writes down why | B6 | The Payroll Review screen has open defects until fixed; say this only after the fix. |
| A hand-entered cash tip count is never overwritten by the POS | B7 | True; no dedicated test found. |
| Bank account numbers are encrypted | A31, L3 | Last four digits are shown back on screen. |
| What Rail does not do is in writing on `/terms` | L1, L2 | Do not quote the Terms' export and deletion promises; the register marks them UNSUPPORTED (L9, L10). |
| The money arithmetic is covered by automated tests | B4 | Say it without a count. The 1,220 figure is not confirmed. |
| Stock moves when drinks are sold, converted through pour sizes | B8, B20 | Only after container and pour sizes are set. |

**Not yet true. Do not use.**

| Wanted | Why not |
|---|---|
| "Used by bars like yours", any customer count | None on record [register D8]. |
| Any testimonial, quote, logo or case study | None exists; written owner permission is required first. |
| The founder's own bar's name | Stays "the founder's own bar" until written permission. |
| Any hours or money saved | Unsupported [A8]. `TODO(owner)`: the founder records real before and after figures for their own bar and says in writing which may be used, labelled as one bar. |
| "Set up in minutes" or "under an hour" | Never measured [A25, A28]. |
| "Tips reconcile to the Z report" | Only in tests and on the demo bar; two real-data checks are waiting [B5]. |
| A price | Not published; every figure is HYPOTHESIS [B13]. |
| "Pay your staff correctly" | Rail works out figures for you to check; the Terms say the bar must check [A24]. |
| "Sign up and start yourself" | There is no public owner sign-up. For the first bars the founder creates the account and sets the bar up in person (`onboarding-checklist.md` section 0). |

---

## 6. Messaging do and don't

The product's own principle governs this list: say what is missing, never overstate (`PRODUCT.md` principle 4).

**Do**
- Say "works out for you to check and approve", not "does your payroll".
- State the limit next to the claim: "stock needs a bottle size and a pour size for each item first" [B20].
- Use "we have not found another tool that..." with the date read, never "the only".
- Say "we set it up with you" only when true for that bar [A25].
- Say what Rail does not do early: no tax filing, no withholding, no holding of money [L1, L2].
- Ask a question before making a statement about a pain (section 3).
- Say "Windows" and "2Touch" plainly [A27].
- Offer the demo bar before anything else [A6].

**Don't**
- Don't say any POS other than 2Touch (or Clover, only to a Clover bar that asks) [A20, A21, A22].
- Don't say "instant", "automated", "100%", "in minutes", "pay correctly", "saves", or "every type of venue" [register Do not say list].
- Don't quote any number: hours, percent, items, dollars, test count.
- Don't say anything about tax filing or withholding as a feature [L1].
- Don't say "the only", "best", "first", "guarantee".
- Don't promise export or deletion on a timetable [A34, L9, L10].
- Don't name a customer or the founder's bar.
- Don't describe the front page's stat tiles as true [A7 to A10].

---

## 7. Jobs to be done: pain, feature, honest limit

| Job (owner's words) | Feature | Honest limit | Claim |
|---|---|---|---|
| "Close the night from the Z report" | A Windows agent reads 2Touch and sends Z reports, employee-week data and the item audit every five minutes; an emailed nightly report is the fallback | Windows and administrator install. An amber "no data" status can mean the bar was closed or the feed is broken. A feed that moved nothing is not a healthy feed. | B12 |
| "Split the tips by our rule" | Pooled by hours, individual, or percent of sales; barback cut; opener bonus | Pooled staff are paid by the pool engine (`lib/payroll/tip-pool.ts`); individual and percent-of-sales are worked out in `lib/payroll/night-split.ts`. Both have automated tests [A15]. No mode has been checked on a stranger's real nights. Not verified: that a night's tips reconcile to the Z report on real data [B5]. Tell the owner to check the first nights by hand. | A15, B5 |
| "Count the cash tips" | A person types the cash tip count and the POS never overwrites it | Cash tips are entered, not read, so "automated" is not accurate [A9]. | B7 |
| "Know what to pay and sign off" | Pay run frozen at submit; owner approves; bank file locked until approval | Rail does not file or withhold tax and does not move money. The bar checks the figures. Review screen defects are open until fixed. | B6, L1, L2 |
| "See how the night did" | Sales trends, tip percentages and per-server sales from Z reports | Depends on the feed having brought data. | A16 |
| "Know when I am low" | Low-stock flag against par, a daily alert; stock moves as drinks sell | Needs a container size and a pour size or recipe per item, which takes real work per bar. Alerts are once a day, not instant. | B8, B9, B20 |
| "Order from my reps" | Orders by email or text with a history | None beyond reps being set up. | A17 |
| "Know what a delivery cost" | Cost is what the invoice charged | Older deliveries fall back to the item cost price (`AGENTS.md`). | B8 |
| "Hand my accountant the numbers" | Pay figures the owner has checked and approved, to pass along. Draft W-2 and 1099-NEC screens exist but are not offered [A19, PARTLY] | Rail does not file or withhold tax. The withholding behind the draft figures is unchecked and switched off, so do not demo or sell the tax screens (pricing section 3). | L1, A19 |

---

## 8. Channel variants (facts do not change)

| Channel | What changes | What does not |
|---|---|---|
| In person, at the bar in a quiet hour | Open with the question ("show me how last night's tips were split"), then the 2Touch line, then offer the demo bar on your phone | The limits: Windows install, stock setup later, no tax filing |
| Warm introduction (an owner the founder knows; a supplier rep only after counsel answers briefing Q12) | The introducer says only the one-line intro; the founder follows with the demo link | No one is paid or rewarded for an introduction until counsel answers G3 question 3 |
| Inbound page or demo request | Category line "One app for the whole bar" and the demo bar; no 2Touch line on the page unless the owner confirms; no price on the page at all until a payment link works and three bars have paid (strategy section 4) | The page may not carry the register's UNSUPPORTED claims; that fix is a separate code task for the owner |
| Email (only to someone who asked for one, once a domain, mailbox and postal address exist) | Subject and two lines from section 4 | Cold email, calls and texts wait for counsel (G3). A reply to a demo request is the one exception (playbook section 2.3) |
| Leave-behind card or sign | Demo link, "what Rail does not do" list from section 6 | Same words as the conversation |

---

## 9. Questions for the early conversations, and what would change the positioning

Each is a HYPOTHESIS test. Record answers in the metrics sheet (G6). Stop rule from strategy: fewer than 5 of 20 conversations leading to a pilot means test Clover bars or lead with stock instead.

| Question | If the answer is... | Then change... |
|---|---|---|
| "Show me how last night's tips were split." | Mostly a POS report or a payroll company does it, nobody does it by hand | The beachhead; the close is not the pain. |
| "How long did that take, and who checks it?" (write down their words, do not suggest an answer) | They shrug, it is five minutes, nobody argues | Lead with stock or sales analytics, not the close. |
| "Has anyone disputed a tip split?" | Yes, regularly | Keep the pain line; use their words. |
| "Is your tip rule pooled by hours, individual, or by sales?" | A rule Rail does not have | Add to the "not yet" list and the product wishlist. |
| "Who owns the Windows login on your POS computer?" | Nobody can say, or 2Touch staff manage it | The install step is the real barrier; test the email fallback. |
| "Would you let someone read your 2Touch data with a read-only login?" | No | Add a fear line about the read-only login [L6, E2]. |
| "What do you use now for stock?" | A system they like | Stock moves to later; do not lead with it. |
| "Do you pay by direct deposit or cash and check?" | Mostly cash | The bank-file feature is not a hook; lead with the figures. |
| "Do you know other 2Touch bars?" | Yes, many | Referrals are the channel; the pool may be larger than guessed (the 2Touch count is UNVERIFIED). |
| "What would you want Rail to say no to?" | A boundary we do not have | Add it to the "does not do" list. |

---

## Unverified

1. The size of the 2Touch bar pool near Cincinnati and Northern Kentucky.
2. That owners do tips by hand, find it painful, or dispute splits (section 1, 2, 3, 9 are all HYPOTHESIS).
3. That no tool does stock, tips and pay, sales and rep orders together for one bar [B3]; the competitor pages need a dated re-read.
4. That the 2Touch licence allows a third-party program to read the bar's database (counsel).
5. That tips reconcile to the Z report on real data [B5].
6. Whether the sharper 2Touch line is approved by the owner (`PRODUCT.md`).
7. The founder's own bar's real numbers and permission to use them (`TODO(owner)`).

## Sources

All inside the repo, read 2026-11-25: `docs/superpowers/findings/2026-11-25-gtm-manager-plan.md`, `docs/go-to-market/strategy.md` (decisions 1 and 2, section 2), `docs/go-to-market/claims-register.md` (all claim IDs above), `docs/go-to-market/battlecards.md` (the Rail side), `docs/go-to-market/onboarding-checklist.md`, `PRODUCT.md`, `AGENTS.md`. No outside pages were read.
