# Direct deposit through a third-party API: prices, limits, shortlist

Date: 2026-11-25. Research only, no code changed. Follows `2026-11-25-direct-deposit-replacement.md` (not repeated here).

Labels:
- **[read today]** I fetched the vendor's own page today.
- **[snippet]** vendor page seen only through a search result snippet.
- **[3rd party, dated]** aggregator or review; date given where the source gave one.
- **[unverified]** inference or recollection; ask the vendor or a lawyer.
- **[blocked]** page refused my fetcher.

Not legal or tax advice. Every legal statement is [unverified].

## 1. What I could and could not read

Read today: stripe.com/connect/pricing, stripe.com/pricing, moov.io/pricing, moov.io/legal/platform-agreement/prohibited-restricted-businesses, increase.com/pricing, plaid.com/pricing, trolley.com/pricing, routable.com/pricing, mercury.com/pricing, kickfin.com (no prices on page), dwolla.com (no prices; says custom), 7shifts pricing page (returned only a heading).

Blocked or empty: paypal.com payouts page (403), column.com/pricing (empty body; figures from a search snippet of that page), checkhq.com/pricing (404), hyperwallet.com/pricing (404), 7shifts.com/pricing (heading only), getastra.com (wrong company, ignore).

Search only (no page read): Check, Gusto Embedded, Zeal, Rollfi, Salsa, Modern Treasury, Unit, Tipalti, Astra, Melio, Branch, Square payouts, Hyperwallet, Clair, DailyPay, Gratuity Solutions, TipHaus. Salsa, DailyPay, Gratuity Solutions, TipHaus and Netspend returned nothing usable: **not found, not researched further**.

## 2. Vendor table

Columns: price, speed and cost, who holds bank data and originates, wage use, KYC, no-entity signup, effort, tax filing.

### Payout rails

**Moov** (platform moves money; bar and each employee are Moov "accounts")
- Price [read today]: no platform fee, no setup, **$500 monthly minimum** on standard pricing. Next-day ACH credit 25 cents, same-day 40 cents, RTP credit 0.95% (50 cent min, $5 cap), push to card 0.95% (same min and cap), deferred push to card 25 cents. ACH return $5, unauthorized return $15. Verified individual (KYC) $2.50 plus $0.50 per month. Verified business (KYB) $4.50. Moov wallet 50 cents per active wallet per month (unclear if this stacks with the KYC monthly line; ask). Instant bank validation 75 cents per attempt.
- Bank data: Moov holds it, via a hosted component (unverified detail). Originator: Moov through its partner bank (unverified). Liability for returns: platform or user per Platform Agreement, not read.
- Wage use: prohibited-business page lists "Payroll Processing" (MCC 8931) as a vertical needing enhanced due diligence: "Payroll services provided by third parties for businesses. Includes accounting, tax-related servicing, and payroll processing." [read today]. It does not mention wages or employee payments. That reads as a flag on a platform like Rail, not a ban. Ask.
- Moov's Card Issuing Terms list payroll expenses among restricted card uses [snippet]; cards are not the ACH product.
- No entity: not stated. Effort: medium (accounts, capabilities, payment methods, transfers, webhooks). Tax filing: none.

**Stripe Global Payouts / Treasury ACH** (stripe.com/pricing [read today])
- ACH next day $0.50, same day $1.00 per payout; first 50 monthly domestic payouts on local rails included; 0.05% platform fee above $1M monthly volume. Instant payouts 1.5%, 50 cent min. Treasury: no minimums or monthly fees.
- Financial Connections: instant bank verification $1.50 per success, micro-deposits free, owner verification $1.50 [read today].
- Whether the free 50 is per Rail account or per bar: not stated. I show both cases below.

**Stripe Connect payouts** (stripe.com/connect/pricing [read today])
- "You handle pricing": $2 per monthly active account (a month in which a payout reaches its bank or card), plus 0.25% + 25 cents per payout sent. Instant payouts 1%. Global Payouts: no price on that page.
- Stripe-handled model: no platform fee; the connected account pays Stripe's fees.
- Wage use: the page I read says nothing. A search snippet of Stripe docs says transfers "may only be used alongside the permitted use cases for charges, top-ups and fees" [snippet]. A competitor (Wingspan) says Stripe does not document W-2 payroll [3rd party, undated, biased]. A Stripe Issuing page says cards cannot disburse payroll [3rd party summary of Stripe's restricted list]. **Treat wage payouts as unconfirmed and likely out of intended use.**
- Rail already has a Stripe account; sole proprietor signup with SSN reported in first-round research [snippet].

**Dwolla**: **not published** on its page [read today: "Pricing is tailored..."]. Third-party listings give pay-as-you-go 0.5% per transfer (5 cent min, $5 cap), Launch $250/month, Scale $1,000/month [3rd party, 2026 pages, undated, and a May 2026 review says the page now sends everyone to sales, so possibly stale]. One report says Dwolla dropped its 25 cent fee [3rd party, date unclear].

**Increase** [read today]: next-day ACH $0.50, same-day $2.00, RTP $2.50, FedNow $2.50, return $5, unauthorized return $15. Platform fee "varies by use case", minimum not published. It is a bank-grade API; each bar would need its own entity and account under Rail as program manager (unverified). Sole individual unlikely to qualify (unverified).

**Column** [snippet of column.com/pricing]: $0.50 per standard ACH, plus $0.50 same-day surcharge, $2.00 administrative return, **monthly minimum not published** and varies by use case. Same fit problem as Increase.

**Modern Treasury**: not published; custom with platform fee plus per-payment fee [3rd party, 2026]. Needs your own bank partner. Not for this stage.

**Unit**: not published; negotiated minimum plus per-transaction fee [3rd party aggregator]. BaaS, needs entity and contract.

**Plaid Transfer**: only on the Custom plan, no price listed [read today]. Auth is a one-time fee per connected account; one 2026 source says $1.00 to $1.25 [3rd party, 2026], another says $0.10 to $0.25 per call and contradicts Plaid's own one-time model. Plaid does not say whether Transfer may be used for payroll.

**PayPal Payouts**: API $0.25 flat per transaction; web 2% capped (cap $1 per Wise, 3rd party) [snippet of PayPal page; page itself blocked]. Recipient needs a PayPal or Venmo wallet, not a bank deposit. Wage use not read. **Hyperwallet**: not published; PayPal terms say PayPal pricing does not apply [snippet].

**Trolley** [read today]: Platform plan $0 per year plus fees; ACH $1.00 per payment; debit card 1.00% with $1.50 minimum; Venmo $1.50; wire $25; identity verification $2.50 per scan; annual plans $1,199 to $2,399 for add-ons. Built for contractor payments; wage use not read.

**Routable** [read today]: Growth $1,250 per month, no per-transaction fee listed. Accounts payable tool for vendors, wrong shape for employees.

**Tipalti**: quote only. Starting fee conflicts ($99, $149, $249 per month across sources) [3rd party, dated 2026]; ACH $0.50 to $2.00 per payment [3rd party Vendr estimate]. AP and global payee tool, wrong shape.

**Astra**: not published. Push-to-card instant payouts via Visa Direct, one daily net ACH debit [docs snippet]. A comparison site cites 1.5% [3rd party, unreliable]. Fees are optional for the platform to add on top.

**Melio**: ACH free on plan allowances, then $0.50; same-day ACH 1%, capped $30 [snippet]. API only on Platinum, custom, sales [snippet]. A bill-pay tool, not for payroll.

**Mercury** (the bar's own bank) [read today]: ACH, same-day ACH and RTP free to send. "Making mass payments on our API" may incur fees, amount not listed. API docs say payouts via ACH, check, wire, RTP [snippet]. Mercury Payroll add-on $100 per month plus $50 per person paid per month, waived until 2026-12-31 [read today]. Bar is account holder and originator; Rail would hold an API token and must also hand Mercury each employee's account number, so Rail still touches bank numbers unless Mercury offers a hosted recipient flow (ask). Sole proprietor eligibility not stated.

**Square payouts**: instant transfer 1.75% [snippet]; relates to the seller's own sales payouts, not paying third parties. Not a fit.

### Tip payout and wage-access specialists

- **7shifts Tip Payouts**: the legacy feature was retired 2026-06-30; replacement is Clair on-demand tip payouts [snippet of 7shifts help centre]. Employer or employee pays a per-payout fee, amount not stated. Clair's advance product charges $4.99 for instant bank delivery [snippet, may not apply to tips]. Needs 7shifts as the scheduling system, so not an API Rail can call.
- **Kickfin**: not published; "no setup fees" [read today]; funds "immediately available, 24/7" and connects to the POS to compute tips, which overlaps Rail's own tip logic. A review-site table shows $0.25 to $1.00 per payout marked "Hypothetical" [3rd party, 2023], not usable.
- **Branch**: instant advance up to $150 per day, expedited fee $2.99 to $4.99 [3rd party, regulator memo from the 2019-2021 period]. Employer pricing not found. Earned wage access is a lending-adjacent product with its own state rules (unverified).
- **DailyPay, Gratuity Solutions, TipHaus, Netspend**: not researched, no usable source found.

### Embedded payroll APIs (these also file taxes)

- **Check**: no public price; checkhq.com/pricing 404. Check's partner playbook suggests a platform charge floor of **$40 base plus $6 per employee per month**, and $50 plus $8 to $10 as better value [snippet of Check help centre; this is what a platform would charge its customer, not Rail's cost]. Tips: docs example showed `tip_credit_amount` only (first-round research).
- **Gusto Embedded**: price "reach out to your Partner Manager"; Gusto invoices the partner monthly per active employee; partner sets customer price [snippet of Gusto docs and terms]. Direct Gusto Simple $49 + $6 per person [snippet of gusto.com/pricing, not the partner rate].
- **Zeal, Rollfi, Salsa, Paychex, ADP partner APIs**: not published. Third-party market range for embedded payroll: $35 to $70 base plus $6 to $10 per employee per month [3rd party, 2026 directory].
- All of these hold bank data, originate ACH under their own agreements, take employer-of-record style liability for tax filing, and need a per-company EIN (first-round research). No-entity partner signup: not stated anywhere.

### Bank-account linking so Rail never sees numbers

- **Stripe Financial Connections** $1.50 per successful verification, micro-deposits free [read today].
- **Plaid Auth** one-time per connected account, $1.00 to $1.25 [3rd party, 2026]; Plaid's page shows Auth in all plans, no number [read today].
- **Moov** and **Stripe Connect** each ship their own hosted bank-collection component, so linking comes bundled with the payout vendor [unverified detail].

## 3. Worked costs

Assumptions (mine, state them to the owner): net pay per payout $1,200 biweekly, $600 weekly, $80 per nightly tip payout. 26 biweekly runs = 2.167 per month; 52 weekly runs = 4.333 per month.

- Bar A: 10 staff, biweekly. 10 x 2.167 = **21.67 payouts per month**.
- Bar B: 20 staff, weekly. 20 x 4.333 = **86.67 payouts per month**.
- Bar C: 30 staff weekly = 30 x 4.333 = 130 wage payouts. Plus tips: assume 15 tipped staff, paid 5 nights a week, 5 x 4.333 = 21.67 nights, 15 x 21.67 = **325 tip payouts**. Total **455 per month**.

Fixed charges that fall on Rail, not per bar, are shown separately.

### Published prices only, payout-only rails (cost per month, then per employee per month)

| Option | Bar A | Bar B | Bar C next-day tips | Bar C instant tips |
|---|---|---|---|---|
| Moov, next-day ACH | 21.67 x 0.25 = 5.42, plus 10 x 0.50 = 5.00, **$10.42** ($1.04 per employee) | 21.67 + 20 x 0.50 = **$31.67** ($1.58) | 130 x 0.25 = 32.50, 325 x 0.25 = 81.25, 30 x 0.50 = 15, **$128.75** ($4.29) | tips RTP at 0.95% of $80 = $0.76 each: 32.50 + 325 x 0.76 = 247.00 + 15 = **$294.50** ($9.82) |
| Moov one-time KYC/KYB | 10 x 2.50 + 4.50 = $29.50 | 20 x 2.50 + 4.50 = $54.50 | 30 x 2.50 + 4.50 = $79.50 | same |
| Stripe Global Payouts ACH $0.50, no free allowance | 21.67 x 0.50 = **$10.83** ($1.08) | **$43.33** ($2.17) | 455 x 0.50 = **$227.50** ($7.58) | tips by instant payout, 1.5% of $80 = $1.20: 65 + 325 x 1.20 = **$455.00** ($15.17) |
| Stripe Global Payouts, 50 free per month counted per bar | **$0** | (86.67 - 50) x 0.50 = **$18.33** ($0.92) | (455 - 50) x 0.50 = **$202.50** ($6.75) | not applicable |
| Stripe Connect, you handle pricing | 10 x 2 = 20, plus 21.67 x (0.0025 x 1,200 + 0.25 = 3.25) = 70.42, **$90.42** ($9.04) | 40 + 86.67 x (1.50 + 0.25 = 1.75) = 151.67, **$191.67** ($9.58) | 60 + 130 x 1.75 = 227.50 + 325 x (0.20 + 0.25 = 0.45) = 146.25, **$433.75** ($14.46) | Instant 1% of $80 = 0.80 vs 0.45 ACH: higher |
| Increase / Column, per-payout only | 21.67 x 0.50 = **$10.83** | **$43.33** | **$227.50** | Increase RTP 325 x 2.50 + 65 = **$877.50**; Column same-day 325 x 1.00 + 65 = **$390.00** |
| PayPal Payouts API $0.25 | **$5.42** ($0.54) | **$21.67** ($1.08) | 455 x 0.25 = **$113.75** ($3.79) | same, PayPal wallets only |
| Trolley ACH $1.00 | **$21.67** ($2.17) | **$86.67** ($4.33) | **$455.00** ($15.17) | debit card, 1% under $1.50 min so $1.50: 130 + 487.50 = **$617.50** ($20.58) |
| Mercury own account | **$0** payout fees ($0 per employee) | **$0** | **$0** | RTP free: **$0** |

Notes on the table:
- Increase and Column exclude a platform fee or monthly minimum that is **not published**.
- Moov's $500 monthly minimum is Rail's, spread over every bar. At the Moov rows' average of about $50 per bar, ten bars still sit under the minimum; Rail carries the gap.
- Mercury excludes any "mass payments on API" fee, **not published**.
- Return risk is extra everywhere: Moov $5 per return, Increase $5, Column $2.

### Not published, so not computed

Dwolla (vendor says custom), Plaid Transfer, Modern Treasury, Unit, Astra, Kickfin, Clair/7shifts tip fee, Hyperwallet, Tipalti, Check, Gusto Embedded, Zeal, Rollfi. Dated third-party only: **Dwolla** pay-as-you-go 0.5% (5 cent min, $5 cap): Bar A 21.67 x $5 (0.5% of 1,200 = 6, capped) = $108.33; Bar B 86.67 x 3.00 = $260.00; Bar C 130 x 3.00 + 325 x 0.40 = $520.00. [3rd party, 2026, conflicts with Dwolla's own "custom" page; indicative only.]

### Payroll providers that also file taxes (comparison, base plus per person)

| | Bar A (10) | Bar B (20) | Bar C (30) |
|---|---|---|---|
| Square Payroll $35 + $6 [read today, first round] | 35 + 60 = **$95** ($9.50) | 35 + 120 = **$155** ($7.75) | 35 + 180 = **$215** ($7.17) |
| Gusto Simple $49 + $6 [snippet] | **$109** ($10.90) | **$169** ($8.45) | **$229** ($7.63) |
| QuickBooks Workforce $50 + $7 [read today, first round] | **$120** ($12.00) | **$190** ($9.50) | **$260** ($8.67) |
| Check at its suggested resale floor $40 + $6 [snippet; resale price, not Rail's cost] | **$100** ($10.00) | **$160** ($8.00) | **$220** ($7.33) |
| Mercury Payroll $100 + $50 per person [read today; waived to 2026-12-31] | $600 | $1,100 | $1,600 |

None of these includes daily tip payouts. A payout-only rail beats full payroll on price only when the bar already files taxes elsewhere. Rail already computes withholding, so a bar paying Rail for filing too would pay for tax work twice.

### What Rail could charge on top (judgment, [unverified])

Payroll providers charge $6 to $7 per person on top of a $35 to $50 base, and bars accept that because it includes filing. For payout only, a bar will likely tolerate roughly $2 to $4 per paid employee per month. Example on Moov: Bar B costs Rail $31.67 (plus its share of the $500 minimum); charging $3 per employee gives $60, margin about $28. Bar C with instant tips costs $294.50; charging $3 per employee plus pass-through of RTP fee covers it. Pass instant-payout fees through to the bar or the employee rather than absorbing them.

## 4. Legal and compliance questions (all [unverified], take to a lawyer or accountant)

1. **Is paying wages through a payout API acceptable?** Stripe's Connect permitted-use language and Moov's payroll-processing vertical both suggest payroll is a special case. Get each vendor to confirm in writing that employee net wages are an allowed use, and whether an employer-paid wage must go through a payroll-licensed party.
2. **Who is the employer of record?** The bar, always, if Rail only computes and instructs. The withholding, deposits, W-2s and state filings stay the bar's duty. Check or Gusto Embedded can take filing on, but then Rail is a payroll reseller with penalty exposure. Ask whether Rail's calculation errors make Rail liable and whether a disclaimer is enough.
3. **Money transmitter exposure.** If funds sit in an account Rail owns, or Rail holds a balance for a bar between funding and payout, Rail may be a money transmitter needing state licences and FinCEN registration. If the bar is the account holder and money goes bar account to employee account, with Rail only sending instructions, exposure is lower. Ask a lawyer whether "instruct only" with an API token that can move funds still counts as control. Also ask whether a payroll exemption applies in each state.
4. **NACHA third-party sender.** Per NACHA: if the intermediary holds the origination agreement with the ODFI, it is a third-party sender, must be registered by the ODFI within 30 days of the first entry, needs its own audit and risk assessment, and cannot lean on another sender's [snippet of nacha.org and bank guides]. If the originator (the bar) holds the agreement and Rail is only a service provider, no third-party sender status arises [same source]. Ask each vendor which role Rail is under their model, and whether a vendor's own ODFI relationship makes the vendor the sender.
5. **No legal entity.** Rail as a sole individual signing a platform contract carries unlimited personal liability for returns, fraud and fines. Ask the lawyer whether to form an LLC before signing anything with a Moov-style platform agreement.
6. **Same-day and instant payments are irrevocable** (RTP, push-to-card): a wrong amount cannot be pulled back. Ask what the bar's remedy is and who bears it.
7. **Tips**: pooled and cash tips on W-2; whether instant tip payouts count as wages paid when made. Ask the accountant.
8. **Data**: with a vendor holding bank data, update the privacy policy and delete stored data under the owner's decision.

## 5. Architecture that keeps Rail out of the flow of funds

- The **bar is the account holder and originator**: it opens its own funding account with the vendor (or uses its own bank, as with Mercury), signs the vendor's user agreement, and completes KYB.
- **Each employee enrols in a vendor-hosted component** in Rail's employee portal. The vendor returns an account id and payment-method id; Rail stores only those ids. No account or routing number ever reaches Rail.
- The owner presses one button. Rail checks the approved pay-run snapshot, computes net via `lib/payroll/ach-net.ts`, and sends instructions: "move this amount from the bar's account to this employee's payment method", with an idempotency key. Rail never holds a balance and is not in the settlement path.
- Rail's API credential is scoped to initiating transfers for one bar. That is still a powerful token; store it encrypted per org, require a re-auth step for sending, and cap per-run totals to the snapshot.
- Webhooks update the payouts ledger (pending, paid, returned).

Which vendors can actually do the first bullet for a platform without being the funds holder is **the central question for each sales call**.

## 6. Ranked shortlist

1. **Moov.** Fully published prices, bar can be its own Moov account, per-employee KYC bundled, next-day 25 cents, instant RTP and push-to-card priced and capped at $5. Weakness: $500 minimum on Rail; payroll-processing is a due-diligence vertical; sole-individual signup and wage use unconfirmed.
2. **Stripe (Global Payouts or Connect).** Published prices, Rail already a customer, Financial Connections for bank linking at $1.50. Weakness: wage-payout fit looks doubtful, bar-owned balance model unclear, free allowance scope unclear. Cheapest published rate if allowed.
3. **Check (embedded payroll).** Only option that removes both bank data and tax filing and employer-risk. Price not published, sales and contract first, replaces Rail's tax engine. Becomes first if the lawyer says wage payouts must run through a licensed payroll party.

Not recommended now: Increase, Column, Modern Treasury, Unit (need an entity and bank programme); Dwolla (sales-gated, mixed price evidence); PayPal and Trolley (wallet or contractor shape); tip specialists (tied to their own tip system, prices hidden).

## 7. One recommendation

**Start a conditional build on Moov**, gated on three written yeses: wages are an allowed use, a sole individual (or Rail after an LLC) can be the platform, and the bar can be the funding account holder with Rail instructing only. If any is a no, fall back to Check and accept the tax-engine replacement. Keep cheque and cash as is. Keep "export" as the default for bars that do not enrol.

### Code that changes (conditional on the above)

- New `lib/payouts/moov.ts` adapter: create account, request capabilities, create transfer with the idempotency key, webhook handler. Behind an interface so the provider can change.
- `payroll_payouts` ledger already has idempotency keys (`ux_payroll_payout_idempotency`): reuse as the provider idempotency key; add `provider`, `provider_transfer_id`, `status` (pending, paid, failed, returned) columns.
- Pay-run snapshot and approval gate stay unchanged; the send step must refuse any run not approved, as the NACHA route does today.
- `ach-net.ts` stays the single source of the amount; convert to integer cents before calling the provider.
- Employee portal: replace the SMS-verified bank form with the vendor's hosted enrolment; store `provider_account_id` and `payment_method_id` instead of encrypted bank numbers.
- Delete after migration (owner decision, not done here): `lib/direct-deposit/`, `direct-deposit-service/`, `direct_deposit_accounts`, `dd_commit_account`, `DD_ENCRYPTION_KEY`, Twilio OTP, ODFI settings, and `app/api/payroll/nacha` and `lib/payroll/nacha.ts` unless kept as the export fallback.
- Webhook route with signature check; per-org scoping per the `admin-scope-ok` rule.
- Nightly tip payouts need a second run type (tip-only) written to the same ledger so the weekly wage run subtracts what was paid.

## 8. Questions to send each vendor

**Moov**
1. Is paying employee net wages from a bar's account to employee accounts an allowed use? Quote the clause. Does "Payroll Processing" in the prohibited-and-restricted list apply to a platform that only instructs?
2. Can a sole individual with no entity sign the Platform Agreement? Is a waiver or reduction of the $500 monthly minimum available at under 20 bars?
3. Who is the ODFI and originator, and is Rail a third-party sender or a service provider? Who bears returns and fraud?
4. Does the $0.50 per month KYC line stack with the $0.50 per month wallet fee? What is the SLA for individual KYC on employees without an SSN on file?
5. Are RTP and push-to-card limited by recipient bank, and what is the fallback to ACH?

**Stripe**
1. May Connect or Global Payouts move employee net wages? Quote the permitted-use clause.
2. Can each bar hold its own balance or Financial Account (Standard or Custom account) so funds never sit in Rail's account?
3. Is the 50 free monthly payouts per Rail, per connected account, or per recipient?
4. Can employees be recipients through a hosted flow without Rail seeing account numbers, and what KYC is required of each?
5. Does a sole individual with no EIN qualify for Connect, Treasury and Global Payouts?

**Check**
1. Price per employee per month, base fee, minimum volume, setup fee, and 1099/W-2 fees. Can Rail start with 10 customers?
2. Does a platform with no legal entity qualify for the partner agreement?
3. Which earnings types handle pooled tips, cash tips and tip credit? Can Rail send computed gross-to-net, or must Check calculate tax?
4. Who is liable for a wrong filing caused by Rail's inputs?
5. Does Check support nightly tip-only off-cycle payments, and at what cost?

**Mercury** (if the owner wants the bar's own bank)
1. Do third-party apps get delegated, scoped API access per bar, and is the "mass payments on API" fee published?
2. Is there a hosted recipient flow so Rail does not see employee account numbers?
3. Does Mercury accept a sole proprietor bar as an account holder?

**Increase or Column** (only if the lawyer wants a bank-grade rail)
1. Monthly platform fee and minimum for a platform with 10 to 100 small business customers.
2. Can an individual be the program manager? What KYB is needed on each bar?

**Dwolla and Kickfin** (tips)
1. Dwolla: current price sheet; Kickfin: fee per payout, who pays, and whether the payout API can be driven by Rail's own tip figures rather than the POS feed.

## 9. Gaps

I did not read: any vendor's terms for wage use in full, Moov's Platform Agreement, Stripe's restricted business list (only its snippet), NACHA rules directly, any FinCEN or state transmitter guidance (search returned nothing on payroll exemptions). Those need a lawyer.
