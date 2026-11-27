# Launch and content plan (G9)

Date: 2026-11-25. Branch `rebuild/foundation`. Drafted for the owner. Documents only: no page, config or code was edited, nothing was posted, no account was created, no media was made.

**What this is.** A launch and content plan for one founder with a small time budget. It shows the order things happen in, the gates that hold the public launch back, twelve posts with captions, a 60 to 90 second video script, and how to tell whether any of it worked.

**What to do first.** Nothing public. Tick the gates in section 1. Until G-1 to G-5 are ticked no post goes out, and the only parts to act on are section 5 (the front-page copy list, for the owner to approve as a code task) and the shot list in section 4.

**Rules this plan keeps.**
- No paid ads, no spend, no scheduling tools. The founder posts by hand, or nothing goes out. No agent posts anything.
- No cold direct messages, no cold emails, no cold texts, no cold calls. Those are on hold with the other cold outreach until counsel answers (`outreach-rules-for-counsel.md`, "On hold until counsel answers", which lists direct messages on social media). Social here shows the product and the founder's thinking. It is not outbound selling to strangers.
- Every product statement traces to `claims-register.md` by ID, with its limit. No testimonial, no saving, no setup time, no customer count, no price, no fake screenshot. Visuals come from the demo bar only (`docs/superpowers/specs/2026-11-24-rail-rebuild-design.md`: visuals and the launch video are captured from a demo org, never from a real bar).
- A number that is a belief is written `HYPOTHESIS` with a cheap test. Something not confirmed is written `UNVERIFIED`. Owner-only facts are `TODO(owner)`.

**Words used.** HYPOTHESIS, UNVERIFIED and TODO(owner) as in the strategy. "Gate" means a thing that must be done before the next phase starts. "Claim ID" means a row in `claims-register.md` (for example B2, A43, L1).

---

## 1. The launch sequence, tied to the 90 days and the gates

The strategy (`strategy.md` section 7 and section 8) says days 1 to 30 are "make it true", days 31 to 60 are three pilots, and days 61 to 90 are "ask for money". Its single most important sentence: make the product true for one stranger's bar before finding more strangers. This plan follows that. **A public launch is not a date on a calendar. It is what happens after the gates below are all ticked.**

### The gates (all must be ticked before Phase 2)

| Gate | What must be true | Where it comes from | Status on 2026-11-25 |
|---|---|---|---|
| G-1 | Payroll Review approval issues fixed (the "Confirm Payroll" button that saves nothing, the Approved badge over recalculating figures, no approver/date/total shown) | `strategy.md` section 8 item 1; claims B1, B6 | Not done. Needs the owner's rules first. |
| G-2 | Role fix (A1 in the overnight log) confirmed and deployed on live, and the six tables with row security off checked on live | `strategy.md` section 8 item 2 | Not done (owner step). |
| G-3 | The two real-data tips checks run and recorded | `strategy.md` section 8 item 3; claim B5 | Not done (owner step). |
| G-4 | Front-page and legal-page copy fixed per the claims register: Toast removed, the invented statistics removed, "minutes" and "under an hour" removed, "every type of venue" changed, export and deletion promises fixed or softened, the confirmation-email promise removed, "pay staff correctly" and "calculates payroll automatically every night" reworded, "instant" and "Auto-Reorder" dropped, the Terms and Licence made to agree on the SQL login, the legal entity confirmed or blanked, the hero card labelled sample data | `claims-register.md` Section C items 1 to 10 | Not done. A code change; needs the owner's go-ahead. |
| G-5 | Open doors closed (the cross-bar mailbox poll and the cron route) | `strategy.md` section 8 item 7 | Not done. |
| G-6 | A domain and a mailbox on it exist; the contact is no longer a Gmail address; a postal address exists before anything is printed; hosting plan checked for commercial use | `strategy.md` section 10 items 9; manager plan owner step 4 | Not done. TODO(owner). |
| G-7 | The founder's bar is running Rail on real nights and the owner has written down, in writing, what may be said about it | manager plan owner step 8 | Not known. TODO(owner). |

Not a gate for posting: online billing, the packages table, the native app (`strategy.md` section 8, "Gates").

### The phases

| Phase | When (HYPOTHESIS: the strategy's day counts, reset to the day the gates close) | What happens in public | Posting allowed |
|---|---|---|---|
| **0. Make it true** | Days 1 to 30 | Nothing public. Gates G-1 to G-6 are worked. Owner holds ten in-person conversations with 2Touch owners the founder already knows. | None. The founder's personal accounts are left alone. |
| **1. Soft proof** | Starts when G-1 to G-5 are ticked, at the earliest: every post links to the front page (G-4) and sends strangers into the demo (G-5), and the first pilots need G-5 as well (playbook section 8, Gate A item 4). Runs with the first pilots (days 31 to 60). | The founder's own bar runs on real nights. The demo bar is shown in person, on a phone, in conversation. A short list of warm contacts is invited to look at the demo. The launch video is recorded and sits unpublished. | Only the **S-posts** in section 3 (marked "S"): behind the scenes of building it, and what Rail does not do. These make no claim about pay accuracy, saving or setup, and link to the front page only. Until G-6 is ticked the link is the `vercel.app` address, so the owner may prefer to wait for the domain. Optional. No video yet. |
| **2. Public launch** | Starts only when every gate G-1 to G-7 is ticked, and the front page carries the corrected copy. Likely inside days 61 to 90. | The 4-week calendar in section 3 runs. The launch video is published on the founder's own channels and the front page. | The full 12 posts. |
| **3. Keep going** | After week 4 | Repeat the weekly routine in section 7 at a lower pace (two posts a week). Add a post only from real events: a release, a fix, a question owners asked. | Same approval check. |

**Why a soft proof first.** The strategy's risk 3: leading with tips means the first thing a customer checks is the thing that had a double-count bug last week. A public launch before a stranger has run a pay run on real nights invites the first comment to be a correction. The soft-proof phase lets the product, and the founder's wording, be wrong in front of five people instead of five hundred.

**If a gate slips.** The phase does not start. Do not post a "coming soon" in its place. The S-posts are the only content that may fill the gap, and only at the owner's choice.

---

## 2. Channels and why

**Chosen channels.** All hypotheses about where bar owners are. Test by asking each of the first ten owners the question in section 6.

| Channel | Why | Limit |
|---|---|---|
| **The founder's own bar** (a printed card or a QR on the bar-office door, shown to reps and regulars who ask) | The proof is the place. Reps who visit the bar are already the warm-introduction route in the strategy (channel 2). | No customer or staff name. Nothing is printed at all until a domain and a postal address exist (playbook section 9 print gate; G-6), and nothing about the bar is printed until the owner supplies the bar's name and written permission (manager plan, open question 12). TODO(owner). |
| **A simple public page** (the existing front page after the G-4 fixes; one page, one call to action) | The page already exists, already records demo requests and where they came from. The strategy lists inbound as channel 4. | Do not build a second site. Fix `app/page.tsx` copy (section 5) and stop. |
| **Instagram** (one account) | HYPOTHESIS: bar owners and managers use it already for their own bar, and it favours short video and pictures of a screen. Fits a 60 to 90 second video and a screen recording. | Handle is TODO(owner). Test: ask the first ten owners which app they check at close. |
| **Facebook** (the founder's page, and local bar and hospitality groups the founder is already a member of) | HYPOTHESIS: local trade groups and "bar owners of Cincinnati and Northern Kentucky" style groups are where owners ask each other for tool advice. | Join rules vary. Post only where the group's own rules allow a tool post, read them first, and do not post to a group the founder is not a member of. Do not tag or name any owner. Group names are TODO(owner). |
| **Local trade groups and associations** (as a member, in person, or as a reply when asked) | Trust products sell through people (`strategy.md` section 5). | Only reply when someone asks about tips, payroll or stock tools. Never a drive-by link. Membership and group rules are TODO(owner). |
| **Supplier reps** (in person, unpaid) | The strategy's own warm route. | **Confirm with counsel before the first ask** (`outreach-rules-for-counsel.md` Q12; the alcohol trade rules were not read, and the briefing leaves reps off its allowed-today list). No referral fee and nothing offered in return, whatever the answer, until counsel answers question 3. |

**Why only one or two social platforms.** One person cannot keep four going. Choose Instagram first and Facebook second; the same video and the same captions serve both. **Not chosen, and why:** TikTok and X (more to learn, an audience further from a bar owner with a 2Touch POS: HYPOTHESIS), LinkedIn (owners are not there for bar tools: HYPOTHESIS, but cheap to test once with one post), YouTube as a channel (host the video file once for the front page if the owner wants; do not run a channel).

**What NOT to do.**
- No paid promotion, boosted post, ad, influencer, giveaway or trade-show booth (`strategy.md` "Do not do now").
- No cold DMs, comment-section pitches, tagging bars or owners, or replying "DM me" under someone else's post. On hold with the other cold outreach.
- No scheduling tool, no automation, no bulk posting. The founder presses publish.
- No buying or scraping a list or following a list of bars to prompt follow-backs.
- No fake or "sample" numbers presented as results, no mock-up screenshot, no stock footage of a bar, no AI-generated "bartender" or "owner".
- No testimonial, quote, rating, logo or "trusted by" line. None exists.
- No mention of Toast. No restaurant or hotel posts. No price. No payroll tax talk beyond L1.
- No tagging 2Touch, no comparison with a named competitor on social (battlecards are for conversation).
- Do not name or show a customer's bar, staff or numbers without written permission.
- Do not delete a critical comment. Answer it plainly or leave it.

---

## 3. The 4-week calendar

Three posts a week: 12 posts. **Post IDs P1 to P12.** "S" in the last column marks a post safe for Phase 1. Everything else waits for Phase 2. Days are chosen around bar hours: no posting Friday or Saturday evening (`strategy.md` section 5: Friday and Saturday are not selling days). Times of day are HYPOTHESIS; the owner picks them.

The call to action is one of two, never both in a post: **"Try the demo bar, no signup"** (rests on A43; the page's own wording differs today) or **"Ask us for a walk-through"** (the demo request form). The link in every post carries UTM tags (section 6).

| Wk | Day | Format | Topic | Claim IDs relied on | Call to action | Phase |
|---|---|---|---|---|---|---|
| 1 | Mon | Short video (the launch video, 60 to 90 s) | Launch: one app for the whole bar | B2, A43, A27, L1, L2 | Try the demo bar | |
| 1 | Wed | Screen recording, 20 s | How a nightly close works: last night's sales on the dashboard | B12, A16 | Try the demo bar | |
| 1 | Thu | Text and one screenshot | What Rail does not do (taxes and money) | L1, L2 | Ask us for a walk-through | S |
| 2 | Mon | Screen recording, 30 s | The pay run: submit, an owner approves, then the bank file | B6 (after G-1), L2 | Try the demo bar | |
| 2 | Wed | Text post (question) | How did you split last night's tips? A question, no statistics | A15 | Reply with how you split it | |
| 2 | Thu | Photo or screen, text | Behind the scenes: why the pay run is frozen when it is submitted | B6, B7 | Ask us for a walk-through | S |
| 3 | Mon | Carousel, 5 frames | Tip modes: pooled, individual, percentage, barback cut, opener bonus | A15 | Try the demo bar | |
| 3 | Wed | Text and one screenshot | Behind the scenes: a cash tip count typed by a person is never overwritten by the POS | B7 | Ask us for a walk-through | S |
| 3 | Thu | Text post | What Rail does not do yet: no scheduling, one bar per account, stock needs setup | B2, B8, B20 | Ask us for a walk-through | S |
| 4 | Mon | Screen recording, 30 s | Stock, honestly: a sale moves stock only once pour sizes are set | B8, B20 | Try the demo bar | |
| 4 | Wed | Short video, founder to camera (TODO(owner), optional) | Behind the scenes: why the founder built it | B2 (the story itself is TODO(owner)) | Ask us for a walk-through | S |
| 4 | Thu | Screen recording, 30 s | Demo walk-through: five screens of the demo bar | A43, A42, A44 | Try the demo bar | |

### What each post may rely on (the limits, copied from the register)

- **B2** "one app for the whole bar": approved. Limit: no scheduling, one bar per organisation, stock needs per-item setup.
- **A43 and A42** the demo bar: approved. Limit: the demo is sample data and clears periodically; three demos an hour per address.
- **A27 and B12** the agent: approved. Limit: Windows only; the agent syncs every few minutes; a sync that moved nothing is shown amber.
- **L1 and L2**: approved, the strongest honest lines.
- **A15** tip modes: approved with limits as worded in the register ("worked out for you to check and approve"). Not "100%", not "automated", not "in seconds".
- **A16** sales views from Z reports: partly. Say "see", never "instantly".
- **B6** pay run frozen, owner approves, bank file locked until approval: **PARTLY today**. Do not publish P4 or P6 until G-1 is ticked.
- **B7** cash tips never overwritten: true. Limit: no regression test named it.
- **B8 and B20** stock moves on a sale: true. Limit: needs a container size and a pour size or recipe.
- **A44** "not affiliated with any POS vendor": true, owner to confirm no vendor relationship.

### Captions (words to paste, owner edits then posts)

Each caption below has been checked line by line against the register. `[link]` means the front page with UTM tags from section 6. Alt text is given for every image; accessibility is part of the product (`/accessibility`).

**P1. Launch video (Week 1, Monday).** Claim IDs B2, A43, A27, L1, L2.

> One app for the whole bar. Rail brings last night's sales, the tip split, the pay run, stock and supplier orders into one place.
>
> This is the demo bar, with sample data, not a real bar. It is early, and it is built by one founder. [TODO(owner): one true sentence about where Rail runs on the day this is posted, for example "It runs at the founder's own bar." Leave it out if G-7 is not ticked. Do not say "our first bars" unless a pilot bar exists that day.] Rail reads 2Touch POS today. It does not file or withhold taxes, and it never holds or moves your money.
>
> Look around the demo bar, no signup: [link]

Alt text: "Screen recording of the Rail demo bar: a dashboard, a pay run and a stock list. Sample data."

**P2. Nightly close, dashboard (Week 1, Wednesday).** Claim IDs B12, A16.

> A 20-second look at the morning after a close in Rail. A small program on the POS computer sends the Z report every few minutes. Open Rail in the morning and last night is on the dashboard: sales, tips, and how the night compares with the nights before.
>
> Demo bar, sample data. Rail reads 2Touch POS on Windows today.
>
> Try it: [link]

Alt text: "The Rail dashboard for the demo bar showing last night's sales next to the average of earlier nights. Sample data."

(Screen to capture: the dashboard block headed "Last night" or "Tonight" in `app/(app)/app/dashboard/page.tsx`. The heading changes with the time of day; capture it after the demo bar has a closed night.)

**P3. What Rail does not do (Week 1, Thursday).** Claim IDs L1, L2. Safe for Phase 1.

> Three things Rail does not do:
>
> 1. It does not file or withhold taxes. It is not a payroll provider or a payroll tax filer.
> 2. It does not hold or move your money. Your own bank sends the pay.
> 3. It does not decide for you. It works out the figures; you check them and approve them.
>
> If you want to know more before you look at anything, ask us for a walk-through: [link]

Alt text: "Text on a navy background listing three things Rail does not do."

**P4. The pay run (Week 2, Monday).** Claim IDs B6, L2. **Held until G-1 is ticked.**

> A pay run in Rail: someone submits it, the figures are frozen, and an owner approves it before the bank file can be downloaded. If the figures change after that, the owner sees what changed before agreeing.
>
> Demo bar, sample data. Rail does not move the money; your own bank does.
>
> See it: [link]

Alt text: "Screen recording of the Rail pay run review in the demo bar: submitted figures and an owner's approval. Sample data."

**P5. Tip-split question (Week 2, Wednesday).** Claim ID A15. No statistic is stated.

> A question for bar owners and managers: how did you split last night's tips? Paper? A spreadsheet? Off the top of your head?
>
> We are talking to owners about how this works in real bars, because we think it is slow and easy to dispute. That is a belief, not a result. If you are happy to say how it goes at your place, reply here.
>
> If you would rather look at how Rail does it first: [link]

Alt text: none needed (text only).

(This post is a HYPOTHESIS test: count replies and read them. Do not turn any answer into a statistic or a quote without the replier's written permission.)

**P6. Why the pay run is frozen (Week 2, Thursday).** Claim IDs B6, B7. **Held until G-1 is ticked, then safe for Phase 1.**

> A thing we built and why. When a pay run is submitted, Rail freezes the figures. Otherwise "approve" would mean "approve whatever the numbers are when you happen to look". An owner approves the frozen run and sees what has changed since before accepting.
>
> It is the kind of boring detail that matters when the thing at stake is someone's pay.
>
> Look at the demo bar: [link]

Alt text: "Text post on a navy background."

**P7. Tip modes (Week 3, Monday).** Claim ID A15.

> Tips are not all split the same way. Rail handles pooled by hours, individual, and percentage of sales, a barback cut and an opener bonus. You set the rule; Rail works the night out for you to check and approve.
>
> A cash tip count a person types in is never overwritten by the POS.
>
> Demo bar, sample data: [link]

Alt text: "Five frames, one per tip mode, from the Rail demo bar. Sample data."

**P8. Cash tip count (Week 3, Wednesday).** Claim ID B7. Safe for Phase 1.

> A small thing we are careful about. A POS report can show zero cash tips, because the jar is counted by hand. If a manager counts the jar and types the figure in, Rail keeps that figure. The POS does not overwrite it, even though the agent sends the night again every few minutes.
>
> Ask us for a walk-through: [link]

Alt text: "Text post."

**P9. What Rail does not do yet (Week 3, Thursday).** Claim IDs B2, B8, B20. Safe for Phase 1.

> What Rail does not do yet:
> - Scheduling. It is not a scheduling tool.
> - More than one bar in one account.
> - Stock that is right on day one. A sale only reduces stock once each item has a container size and a pour size or recipe, and that takes real setup.
> - Any POS other than 2Touch today.
>
> We would rather you hear it from us. Ask us for a walk-through: [link]

Alt text: "Text post listing four things Rail does not do yet."

(The line "any POS other than 2Touch" is correct and honest; the register leaves Clover to the owner's choice (A22), so Clover is not named here. Toast is not named anywhere.)

**P10. Stock, honestly (Week 4, Monday).** Claim IDs B8, B20.

> How a sale becomes less stock. A bar sells drinks; stock is counted in bottles and kegs. Rail turns one into the other with a pour size for each item, or a recipe for a deal. Set those up and a sale moves stock. Leave them out and it cannot.
>
> It takes real work per bar, and we say so. Demo bar, sample data: [link]

Alt text: "Screen recording of a stock list in the demo bar with a pour size field. Sample data."

**P11. Why the founder built it (Week 4, Wednesday).** Claim ID B2 for the line about the product. **The story itself is TODO(owner): the founder writes it from their own experience. Do not invent it.**

> TODO(owner): two or three sentences in the founder's own words about why Rail was built. Nothing in here that is a number unless it is a number the founder measured at the founder's own bar and may say publicly.
>
> Rail is one app for the whole bar. Ask us for a walk-through: [link]

**P12. Demo walk-through (Week 4, Thursday).** Claim IDs A43, A42, A44.

> Five screens of the demo bar: dashboard, last night, the tip split, the pay run, a stock item. No signup, no credit card. It is sample data and it is cleared periodically.
>
> Rail is built for bar operators and is not affiliated with any POS vendor.
>
> Try it: [link]

Alt text: "Screen recording of five screens in the Rail demo bar. Sample data."

---

## 4. The launch video script

**Length:** 75 seconds (inside the 60 to 90 second range). **Format:** a screen recording of the demo bar on a phone and a laptop, with a voice over. **Audience:** a bar owner or manager who closes the night by hand. **Stage the product is at:** early; one founder. The voiceover says so at the end. It names "first bars" only if a pilot bar exists on the day of recording (TODO(owner)).

**Rules for the script.** Only the demo bar and real screens. No invented numbers, no testimonial, no stock footage, no mock-up. Every spoken or written product line has a claim ID.

| Time | Visual (screen, from the demo bar) | Voiceover | On-screen text | Claim |
|---|---|---|---|---|
| 0:00 to 0:06 | The demo entry on the front page: the demo button. Then the dashboard of the demo bar opens. | "Closing a bar's night means a lot of separate jobs." | "Demo bar. Sample data." | A43, A42 |
| 0:06 to 0:16 | The dashboard block headed "Last night" (or "Tonight"): sales and how the night compares with the nights before. | "Rail reads your 2Touch sales every few minutes. In the morning, last night is already there." | "Reads 2Touch POS on Windows" | A27, B12, A16 |
| 0:16 to 0:30 | The tips screen: the tip modes (pooled, individual, percentage), a barback cut and an opener bonus. | "The tip split follows the rule you set: pooled by hours, individual, or by percentage of sales, with a barback cut and an opener bonus. You check it." | "You set the rule. You check the result." | A15 |
| 0:30 to 0:45 | The cash tips entry on the payroll close screen: a person types a figure, it stays. | "If you count the cash jar and type it in, the POS will not overwrite it." | "Cash tips you type in are kept" | B7 |
| 0:45 to 0:57 | The pay run: submit, then an owner approves. Show the approval and the locked-then-available bank file. (Record only after G-1 is ticked.) | "A pay run is frozen when it is submitted. An owner approves it before the bank file can be downloaded." | "Rail does not move the money. Your bank does." | B6, L2 |
| 0:57 to 1:05 | A stock list, then the supplier order screen (email or text to a rep). | "Stock and supplier orders sit in the same app. Stock needs pour sizes set up first." | "Stock needs setup" | B8, B20, A17 |
| 1:05 to 1:15 | A plain card, then the front page with the demo button. No animation beyond a fade. | "Rail is early, and one founder builds it. It does not file taxes or hold your money. Look around the demo bar, no signup." | "Early stage. One app for the whole bar. Try the demo bar." and the front-page address | L1, L2, B2, A43 |

(Total 75 seconds. If it runs long, cut the supplier order from the sixth row, not the final row.)

**The ending is the honest one.** It says "early", says who builds it, says what it does not do and ends on the single call to action (the demo). It does not say how many bars use it.

### What must be recorded, and with what (the owner supplies the recording)

No agent produces media. The owner records.

| Item | What | Tool (suggested, owner decides) |
|---|---|---|
| Demo bar | Open the demo from the front page (`POST /api/demo`) on a fresh session. The demo is created with realistic sample data (`lib/demo/seed.ts`) and clears after 24 hours (`DEMO_TTL_HOURS`), so record in one sitting. | The site as it is. Rate limit: three demos an hour per address (A43). |
| Screen capture, phone | The dashboard and stock screens on a phone, since owners close on a phone (`PRODUCT.md`). Not the payroll day view: its rows overlap on a phone until that is fixed (strategy section 8 item 8). | The phone's built-in screen recording. |
| Screen capture, laptop | The tip split, the cash tips entry, the pay run review and the bank file step. | The laptop's built-in screen recording. |
| Voiceover | The seventy-five seconds of words above, read slowly in a quiet room. | A phone voice-memo app or a laptop's recorder. |
| Editing | Cuts, the on-screen text, captions for hearing. | The owner's own editing app. The spec mentions a render from a demo org; any tool works if it keeps to the shot list. |
| Captions | Burned-in captions or a caption file. | Owner's choice. Required: many people watch without sound. |
| A pre-recording check | The screens shown in the video must match the claims. If the pay-run screen still shows the "Confirm Payroll" button that saves nothing or an Approved badge over recalculating figures, do not record it (gate G-1). | Owner. |

**Do not** record a real bar, a real employee's name, a real pay figure, a real bank detail, or the `/app` of any real organisation. If anything unexpected appears on screen, throw the take away. The demo bar's name is "Demo Bar, The Tipsy Tavern" (`PRODUCT.md`).

---

## 5. Landing-page changes the strategy and register require, and a section order

These are **copy suggestions for the owner. Nothing here is an edit.** The change itself is a separate, owner-approved code task (manager plan: "Editing the landing page from this workstream" is not done now). Line numbers are from `claims-register.md` Section A.1 as of 2026-11-25.

### Copy changes (from `claims-register.md` Section C and the "Do not say" list)

| # | Where (register ID) | Now | Suggestion |
|---|---|---|---|
| 1 | Toast, hero and FAQ (A20, A21, `app/page.tsx:43,70`) | Names Toast and Clover and 2TouchPOS | Remove Toast everywhere. "Connect the 2Touch POS you already run with a small agent on the POS computer, or import the exports your POS produces." Keep Clover off until run once (A22). |
| 2 | Stats bar (A7, A8, A9, A10; `app/page.tsx:102-107`) | "5 hrs saved", "28+ items tracked", "100% automated tip calculations" and a price tile | Remove all four tiles. Do not replace with a number. A9 may become "Tip splits worked out for you: pooled, individual or by percentage of sales." |
| 3 | Export and deletion promises (A34, L9, L10) | "Export it at any time", "we delete within 30 days" | "We can export your payroll and sales records on request; account closure is handled by email." |
| 4 | Setup time (A25, A28) | "Up and running in minutes", "under an hour" | "We set it up with you." and "Try the demo now. Setup is done with you; ask us how long your bar's would take." |
| 5 | Thank-you page (T3, `app/thank-you/page.tsx:50-51`) | Tells the requester to reply to a confirmation email that does not exist | Remove the sentence, or build the email. |
| 6 | Venue types (A35) | "Built for every type of venue" | "Built for bars." |
| 7 | Payroll promises (A23, A24) | "Pay staff correctly", "calculates payroll automatically every night" | "Rail brings in your sales every few minutes and works out tips and pay when you ask." and "See problems sooner, get pay figures to check before you pay, and a low-stock flag before you run short." |
| 8 | Feature cards (A14, A18) | "Instant low-stock alerts", "Auto-Reorder" | "Track stock by the bottle and keg, with par levels and a low-stock alert each day." |
| 9 | Hero card (A5) | Looks like real figures | Add "Sample data" to the card. |
| 10 | Contact (A41, A40) | Response promise and "founder sets you up" | Keep only if the founder will honour them, per the register. |
| 11 | Terms and Licence (L7, L12) | They disagree about the SQL login; a legal entity may not exist | Owner decides which is true; `lib/legal.ts` may need the entity set to null. Not copy, but a gate for a public launch. |
| 12 | Price | No price on the page | Keep it that way (spec rule; claim B13 UNVERIFIED). |

### Proposed section order for the front page

The spec's front-page notes (phase 4a): scroll-driven story, real product visuals, **one primary call to action repeated at the natural stopping points**, social proof only where real, a reduced-motion fallback, a performance budget on a phone. The law "Peak-End": end the landing page on the call to action. The spec's "pricing section" is dropped here because the later rule ("Primary call to action stays 'request a demo'. No price numbers on the page until billing exists") overrides it. Hick's law: one obvious next step.

**The one call to action: "Try the demo bar" with "Ask us for a walk-through" as the secondary action beside it** (the page already offers both). Pick one wording and repeat it. The word "demo" appears the same way in every place.

| Order | Section | What it says (all from approved wording) | Claim IDs |
|---|---|---|---|
| 1 | Hero | "One app for the whole bar." One sentence of what it does. The demo button. A sample-data label on the card. | B2, A43, A5 |
| 2 | The night, as a story | One scroll: last night's sales, the tip split, the pay run, in the order a bar closes. Real demo-bar screens. | B12, A15, B6 (after G-1) |
| 3 | What it does, plainly | Four cards: tips and pay, nightly sales, stock, rep orders. Each with its limit in a line. | A15, A16, A14, A17 |
| 4 | What it does not do | "Does not file taxes, does not hold your money, no scheduling, one bar per account." The strongest trust section; keep it visible. | L1, L2, B2 |
| 5 | How it starts | "We set it up with you." Three steps: look at the demo, we connect your 2Touch, you check the first nights. No time claim. | A25 (reworded), A27 |
| 6 | Questions | The eight answers, fixed per the register. | per register |
| 7 | The call to action again, and the form | Demo button and the walk-through form. Last thing on the page. | A43, A41 |
| 8 | Footer | Legal pages, accessibility, "not affiliated with any POS vendor". | A44 |

**Left out on purpose.** No fake social proof, no logos, no review stars, no "bars use Rail" counter, no testimonial, no "trusted by", no price, no animated counter. If the owner later has a real quote and written permission, it goes between sections 3 and 4, and not before.

Design law check (from the spec's table): Von Restorff (one accent, reserved for the call to action and real alerts), Prägnanz (one idea per scroll step), Peak-End (end on the call), reduced motion fallback. `DESIGN.md` voice: navy-and-amber, "a night manager's clipboard", figures in the monospace heading face. Keep the ledger look; do not add a gradient hero or stock bar photographs.

---

## 6. Measurement plan

**No new analytics are assumed.** Nothing here asks for a tool, a pixel or an event.

**What already exists, verified in the repo on 2026-11-25.**
- `lib/utm.ts`: captures `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, plus `gclid` and `fbclid`, plus the landing page path and the referrer host. It stores them in `sessionStorage` (first touch wins; dies with the tab; not a cookie), which keeps `/privacy`'s "no advertising cookies" line true. Do not change that.
- `app/_components/attribution-tracker.tsx` is mounted on the front page only (`app/page.tsx:216`, imported at line 15). **So every campaign link must point at the front page (`/`).** A link to `/terms` or `/login` captures nothing.
- `app/_components/landing/demo-request-form.tsx` sends `attribution: getAttribution()` with the form (line 46). The attribution is stored in `demo_requests.attribution` (jsonb) (`metrics-sheet.md`, section on page views and demo requests).
- Page views: Vercel Analytics, no custom events (`strategy.md` section 7).
- Not recorded: someone who only clicks "Try the demo bar" without filling the form. The demo route `POST /api/demo` is not shown to carry attribution in what was read. UNVERIFIED: whether it does. Treat demo clicks as visible only in Vercel Analytics page views, not per source.
- The metrics sheet (`metrics-sheet.md`) defines the seven numbers and read-only queries; demo requests are explicitly "not one of the seven" and "can be read on its own in the editor".

**The tagging convention (write it down once, use it every time).**

| Parameter | Value | Example |
|---|---|---|
| `utm_source` | The platform | `instagram`, `facebook`, `fb-group`, `rep-card`, `bar-qr` |
| `utm_medium` | The kind of thing | `social`, `group`, `print` |
| `utm_campaign` | The launch and week | `launch-w1`, `launch-w2`, `launch-w3`, `launch-w4` |
| `utm_content` | The post ID | `p1-video`, `p5-question` |

Example: `https://TODO(owner: domain)/?utm_source=instagram&utm_medium=social&utm_campaign=launch-w1&utm_content=p1-video`

Rules: lower case, hyphens, no spaces, no names of people or bars, no personal data (a value is stored in a database column and in an email, capped at 200 characters). Keep a plain list of every link made in the metrics spreadsheet.

**What to read, weekly (HYPOTHESIS thresholds; test by comparing four weeks).**

| Number | Where | Source |
|---|---|---|
| Demo requests per week, with `utm_content` | The SQL editor, a read-only query on `demo_requests` (the owner writes it from the columns listed in `metrics-sheet.md`; no agent runs it) | `demo_requests.attribution` |
| Front page views per week | Vercel Analytics, by referrer | Existing |
| Replies to P5 and any comments | By hand | Count; do not turn into statistics |
| Conversations started from a post | By hand, one spreadsheet row | The metrics sheet's conversation log |
| Which source the pilot's owner says they first saw | Ask in the first conversation | By hand |

**What success looks like (all HYPOTHESIS, with a cheap test).**
- By the end of week 4, at least 3 demo requests from the calendar's links, and at least 1 conversation with a bar owner who is not already known to the founder. Test: read the four-week tally. If fewer than 3 requests came from 12 posts, the channel or the wording is wrong, not the plan: change one thing, run two more weeks, and do not buy reach.
- At least 1 demo request that leads to a pilot, over the 90 days. Test: the metrics sheet "pilots started" number.
- Zero corrections to a claim. The target for wrong claims in public is zero (the same as `strategy.md`'s zero for wrong money figures).
- **Not measured:** follower count, likes and views are not goals. They are not the metric and are not reported to anyone.

**Stop rules.** If after two four-week rounds no post has produced a conversation, stop posting and spend the time on warm introductions (the strategy's channels 1 and 2). If a post draws a correction that is right, take the post down, fix the register, and say so in a follow-up post.

---

## 7. The content production routine for one person

**The routine (HYPOTHESIS: one 90-minute weekly block; the owner sets the real number).** Test: time two weeks and cut the calendar to what fits. The strategy's selling budget is about ten hours a week (HYPOTHESIS); content must fit inside it, not on top.

| Block | Minutes | What |
|---|---|---|
| Batch once, for the month | One extra 3-hour session before Week 1 (HYPOTHESIS) | Record the launch video and all screen recordings in one sitting on one fresh demo bar (it clears after 24 hours); write the captions above into the owner's own notes. |
| Weekly: prepare | 30 | Take the week's three posts. Re-read each against the register (section below). Fix any wording the owner would not say aloud. Make the links with UTM tags. |
| Weekly: post | 15 | Post by hand, on the chosen day. No scheduling tool. |
| Weekly: answer | 30 | Read every comment and reply the same day or the next business day (the page promises a reply within a business day if that line stays). Log conversations in the sheet. |
| Weekly: look | 15 | Read the numbers in section 6. Write down one thing to change. |

Total about 90 minutes a week after the first month's batch. No Friday or Saturday evening work: those are bar nights and not selling nights.

**The approval check before anything goes out (every post, every time).**

1. **Register lookup.** Each statement about the product is matched to a claim ID in `claims-register.md`. The ID is written next to the post in the owner's notes. A statement with no ID is deleted or reworded to match. If the ID's verdict is PARTLY, the limit goes in the post. If it is UNVERIFIED or UNSUPPORTED, the line does not go out.
2. **The "do not say" list.** Search the post for: Toast, every type of venue, hours, saved, savings, items tracked, percent signs, "instant", "minutes", "under an hour", "pay staff correctly", uptime, "delete within 30 days", "export at any time", "the only", "best", "#1", "guarantee", "automatic", a dollar sign, and any customer, result or number of bars. Each hit is removed.
3. **The picture check.** Every screenshot is from the demo bar. The words "Sample data" appear on or beside it. No real name, bank detail or figure is visible. Nothing is edited to look better than the product is.
4. **The gate check.** Is the post allowed in this phase? A pay-run post does not go out until G-1 is ticked.
5. **The owner reads it aloud once.** If the owner would not say it to a bar owner standing at the bar, it does not go out.
6. **Nothing else.** One call to action, one link, tagged. No tagging of other people or bars.

Where a post draws a question the founder cannot answer from the register (for example, "does it do Toast?"), answer: "Not yet. You can import your exports by hand; a direct link is not ready." (A21 suggested wording). Do not guess.

---

## 8. Risks and stop conditions

| Risk | Why it matters | What to do |
|---|---|---|
| **Overclaiming** | The front page and the product already disagree (Toast, statistics, setup time). A public post that repeats them is the first thing a bar owner who knows bars would catch. | The approval check above. Fix G-4 before Phase 2. |
| **Alcohol-marketing rules** | A bar is a licensed business and rules on alcohol advertising may apply to content that shows drinks, to promotions, and to contacts with suppliers. **Confirm with counsel.** Nothing here has been read; **UNVERIFIED.** | Rail is software for a bar, not an alcohol brand. Keep posts about the software: screens, not bottles being poured or drinks promoted. No age-gate or drinking content has been designed. Ask counsel before any post that shows alcohol or involves a supplier. |
| **Platform policies** | Each platform's terms for ordinary (unpaid) business posts, for using a personal profile for a business, and each group's own rules were not read: **confirm** by reading them before the first post (`outreach-rules-for-counsel.md` 2.6). Ad policies do not apply while there are no paid ads. If the owner ever pays for reach, each platform's alcohol, financial-services and business-opportunity rules are likely to matter. **Confirm** by reading each platform's own current policy; none was read for this plan, **UNVERIFIED.** | No paid promotion in this plan. |
| **Using a customer's name or bar without written permission** | The strategy forbids testimonials, logos and case studies before written permission and the numbers. | The founder's bar stays "the founder's own bar" until the owner supplies the name and written permission. No customer is named, tagged, reposted, thanked or shown, even when they offer. Ask for the written permission first. |
| **Cold outreach by the back door** | A comment, a tag or a "DM me" is outreach. Direct messages are on the counsel hold list. | Reply only to people who contact the founder first. Never start a direct message. |
| **Texting and email lists** | Texts and email have their own rules (consent, postal address, opt-out). Rail has no postal address on record. | Do not collect numbers or addresses on social. The form on the front page is the only intake. Nothing is sent to a list. |
| **Privacy of staff and guests** | A screen recording or a bar photo can show employees or customers. | Demo bar only. No photo of people at a real bar without their permission. |
| **The demo breaking in public** | "A pretty page driving cold calls into a demo that breaks" is in the spec's anti-goals. A demo that fails is the first thing people see. | Test the demo flow before every post that links to it. Remember the limit of three demos an hour per address and the 24-hour clear. |
| **A wrong money figure shown** | The strategy's watch item: wrong money figures should be zero. | If a recorded screen shows a figure that does not add up, do not use it. |
| **Founder time** | One person; selling and installing come first. | The calendar yields to an install. Skip a post rather than skip an install. |
| **Legal pages that do not match reality** | The Terms and the Licence disagree (L7); the entity may not be real (L12). A launch sends people to them. | Resolve before Phase 2 (gate G-4 and copy change 11). |

**Stop conditions.**
- Any gate G-1 to G-7 un-ticks (for example, a real bug in tips is found): stop publishing posts that rest on that area until it is ticked again. Tell every pilot bar it affects straight away (playbook section 10 stop rules). A public statement is needed only if a post made the claim; then correct it in a follow-up post.
- A post is found to contain a claim the register does not support: remove it the same day, fix the register or the post, and do not re-post.
- Counsel answers that an activity is not allowed: stop that activity at once.
- Two comments from owners say the demo or the product does not do what a post said: pause the calendar and review every remaining post against the register.
- The founder has fewer than 90 minutes a week: cut to the S-posts and the demo walk-through only.
- A paid-ads or spend idea comes up: not in this plan; the strategy defers it. Do not do it.

---

## Lines cut because the register does not support them

| Line that was considered | Why it was cut | Register ID |
|---|---|---|
| "Close your night in minutes", "set up in under an hour" | Never measured; the install needs administrator rights, SQL access and a mapping | A25, A28 |
| "Save hours every week", "5 hours saved", any saving or time figure | No source | A8 |
| "28+ items tracked", "100% automated tips" | Unsupported; cash tips are typed in | A7, A9 |
| "Works with Toast" or any Toast mention | Not backed; the product's own setup says "coming soon" | A20, A21 |
| "Instant low-stock alerts", "real-time" stock | Alerts run once a day; stock moves only after pour sizes are set | A14, A1 |
| "Tips reconcile to the Z report" | Two real-data checks outstanding; tests and demo only | B5 |
| "Rail pays your staff correctly" | Terms say the bar must check | A23, A24 |
| "Over 1,000 tests pass" or any count | The count was not confirmed | B4 |
| "The only tool that does stock, tips, pay and sales for a bar" | Unverified; at most "we have not found another tool", with the date | B3 |
| Any price, "from $", founding-bar discount or "only ten places" | No price is public; the cap is not confirmed | B13, B14 |
| "Export your data any time", "we delete in 30 days" | No export or delete code found | A34, L9, L10 |
| Any testimonial, customer number, "trusted by", result from the founder's bar | None on record; no written permission | B17, PRODUCT.md |
| Tax statistics or tip-split mistake statistics (for example "most bars overpay tips") | No source; P5 asks a question instead | A11, A12, A13 |
| A post about Clover | The owner has not chosen to claim it; never run | A22, B19 |
| "Built for restaurants and every venue" | Undecided | A35 |
| A comparison with a named competitor | Battlecards are for conversation, and prices carry doubts | B3 |

## Unverified

1. Which social platforms the first ten bar owners actually use. Test: ask each one.
2. Whether Facebook trade groups in the area allow tool posts. Read each group's rules first.
3. Alcohol-advertising and supplier-related rules for the content shown. Counsel.
4. Each platform's current ad and content policies (no paid use planned). Read each before any spend.
5. Whether `POST /api/demo` records the campaign tags with a demo session. Only the demo request form was verified to send attribution.
6. Whether the redesigned dashboard still has the "Last night" block as it is named in `app/(app)/app/dashboard/page.tsx` when the video is recorded.
7. The timing in the video and the 90-minute weekly routine: both HYPOTHESIS.
8. The domain, handles, brand assets, the founder's story, group names and the real publishing days: all TODO(owner).
9. Whether the post-fix pay run screen matches the shot in row 5 of the video; re-check after G-1.
10. The legal entity named in `lib/legal.ts` (L12).

## Sources

All inside the repo, read 2026-11-25.
- `docs/superpowers/findings/2026-11-25-gtm-manager-plan.md` (guardrails, G9 brief, do-not-do list, owner inputs).
- `docs/go-to-market/strategy.md` (sections 1 to 8, 10).
- `docs/go-to-market/claims-register.md` (Section A, B, C, "Approved with limits", "Do not say").
- `docs/go-to-market/outreach-rules-for-counsel.md` (the on-hold list, including social direct messages).
- `docs/go-to-market/metrics-sheet.md` (demo requests and UTM keys).
- `docs/superpowers/specs/2026-11-24-rail-rebuild-design.md` (phase 4a, phase 5, the 16 laws, demo-bar visuals, no price on the page).
- `PRODUCT.md`, `DESIGN.md`.
- `lib/utm.ts`, `app/_components/attribution-tracker.tsx`, `app/_components/landing/demo-request-form.tsx`, `app/page.tsx` (the tracker mounted on the front page), `lib/demo/` (demo seeding, the 24-hour clear, the slug prefix), `app/(app)/app/dashboard/page.tsx` ("Last night" block).
- No outside page was read for this document.
