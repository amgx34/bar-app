# Replacing Rail's direct deposit

Date: 2026-11-25. Research only, nothing in code changed.

Labels used below:
- **[read today]** I read it on the vendor's own page on 2026-11-25.
- **[third party]** from a review or aggregator, not the vendor.
- **[unverified]** not read on a vendor page. Treat as a question to ask, not a fact.
- **[blocked]** the vendor page returned 403/404 to my fetcher, so I could not read it.

Nothing here is legal or tax advice. Every legal statement is [unverified] unless it says otherwise.

## 1. What Rail carries today

Read from the repo:

- `app/api/payroll/nacha/route.ts` (252 lines): owner-only GET. Builds a NACHA file from `computePayroll()` net of advances (`lib/payroll/ach-net.ts`, `lib/payroll/nacha.ts`). It decrypts routing and account numbers in memory, gates on an approved pay run, writes an audit entry. The owner uploads the file to their own bank's business portal. Rail never originates; the bar's bank does. The owner's ODFI routing number and EIN sit in `bar_settings`.
- `lib/direct-deposit/`: `crypto.ts` (AES-256-GCM, key `DD_ENCRYPTION_KEY`), `sms.ts` (OTP via Twilio), `routing.ts` (ABA check).
- `direct-deposit-service/`: a separate FastAPI + Postgres + Redis + Twilio service for two-step SMS-verified enrollment.
- App side: `direct-deposit-actions.ts`, `direct_deposit_accounts` table, `dd_commit_account` RPC, employee portal enrolment, Settings "Payroll & ACH".
- Not NACHA, and the part worth keeping: `lib/payroll/tax/` (about 1,500 lines, federal withholding and FICA), `tip-pool.ts`, `tip-ledger.ts`, overtime, night split, `payouts.ts`, run snapshots and approval (`run-diff.ts`).

So the risk Rail holds is custody of employee bank numbers (encrypted, but Rail holds the key), an SMS enrolment surface, and a hand-built NACHA writer. Rail does not file taxes or move money itself today.

Important consequence: Rail already computes withholding. A full payroll provider would redo that. The cheapest way to stop holding risk is therefore to remove bank data, not to replace the payroll engine.

## 2. Options

Prices are per vendor and not comparable until a bar's headcount is known. "No entity" means the bar or Rail having no LLC. Every payroll provider below needs the *bar* to have an EIN to run employee payroll [unverified for each, except Check, see below]. Rail having no entity is a separate question: embedded APIs require a partner contract, which most likely wants one [unverified].

### A. Embedded payroll APIs (Rail would resell payroll inside the product)

| | Check | Gusto Embedded | Zeal |
|---|---|---|---|
| Takes off Rail | Bank data, tax filing and remittance (50 states + DC), W-2/1099, money movement [third party] | Onboarding, payroll runs, tax filing [third party] | Tax filing, W-2/1099, earned wage access [third party] |
| Price | Not public, negotiated. Docs say contact sales@checkhq.com [read today, docs page]. | Not public for partners. Gusto direct is $49 + $6/person (Simple) [read via search snippet, page itself blocked] | Listed publicly per run and per employee, amounts not given [third party] |
| Minimum | Not stated | Not stated | Not stated |
| No entity | Check docs: each *company* needs its own EIN [read today]. Rail's own entity for the partner agreement: [unverified] | [unverified] | [unverified] |
| Integration effort | High. Company, workplace, employee, bank-account, payroll objects, onboarding component, webhooks | High, with prebuilt UI components [third party] | High |
| Tips | Docs example shows `regular`/`hourly`/`salary` earnings and a `tip_credit_amount` field, no documented tips earning type on the page I read [read today]. Ask Check. | Unknown | Unknown |

Sources read: docs.checkhq.com/docs/overview and /getting-started; fintechspecs.com comparison (third-party). checkhq.com/pricing returned 404, gusto.com/product/embedded-payroll and gusto.com/about/bd/gusto-embedded-payroll returned 403 [blocked].

Verdict: wrong size for now. It means Rail becomes a payroll company in the eyes of the bar (liability for tax penalties, per the comparison article's own advice to get that in writing), needs a negotiated contract before any price is known, and replaces the tax engine that already exists.

### B. Payroll providers a bar exports to

| Provider | Price | Tips | Notes |
|---|---|---|---|
| Gusto | Simple $49 + $6/person, Plus $80 + $12, Premium $180 + $22 [search snippet of gusto.com/pricing; tech.co dated 2026-10-16 agrees; page itself blocked]. Trial/promo mentioned. | Not found | Tip handling needs a check with Gusto [unverified] |
| Square Payroll | $35/month + $6/person; contractor-only $6/person; unlimited runs [read today, squareup.com/us/en/payroll] | Imports direct tips from Square POS only. Pooling not mentioned on the page [read today] | Pays by direct deposit, cheque, or Cash App [read today]. Works best for Square POS bars |
| QuickBooks Workforce Payroll | $50 + $7/person; Premium $88 + $13; Elite $134 + $17; a 70%-off promo to 11/29 [read today, quickbooks.intuit.com/payroll/pricing]. Direct deposit on all plans | Page does not mention tips [read today] | Bars already on QuickBooks |
| Toast Payroll | Not published standalone. Bundle cited as about $69 + $9/employee [third party, merchantmaverick and expertmarket]. Billing is greater-of minimum, PEPM or base+PEPM [Toast support page via search] | Tips Manager (pooling) is a separate paid add-on, about $2.50/employee [third party]. Direct sync passes each person's own tips with no pooling | Expect it needs Toast POS [unverified]. Not relevant to 2Touch bars |
| ADP | Not published; "Get Pricing" button; mentions up to 6 months free [read today, adp.com] | Not on page | Sales call |
| Paychex | Not published; "Request Pricing" [read today, paychex.com]; lists a 1-19 employee small-business plan | Links a tipped-employee guide, content not read | Sales call |

Takes off Rail: everything (bank data, tax, tip reporting, deposit). Rail's role shrinks to hours, tips and a clean export.

No-entity sign-up: not stated on any page I read. Employee payroll with any of them needs an EIN for the bar [unverified]. A sole proprietor with employees can hold an EIN without an LLC, which is the likely route [unverified, ask the bar's accountant].

### C. Payout rails (Rail still does payroll maths, a third party moves money)

| Rail | Price (read today unless marked) | Takes off Rail | No entity? | Effort |
|---|---|---|---|---|
| Stripe Connect payouts | Platform-pays-fees model: $2 per monthly active account, plus 0.25% + 25 cents per payout sent (stripe.com/connect/pricing). Stripe-bills-users model: no platform fees. Instant payouts 1% (Connect page) / 1.5% min 50 cents (general page). Standard payouts free on the general pricing page, which sits oddly beside the Connect fee, so confirm. | Bank data custody (Stripe holds employee bank accounts, with KYC). Not tax filing, not tip reporting, not NACHA origination | Stripe says a US sole proprietor can sign up with an SSN and no EIN [Stripe support, via search; page not opened]. Whether payroll-style payouts to employees fit Connect's terms [unverified, material risk: Stripe may treat wages as outside its intended use, ask] | Medium. Onboard each employee as a connected account (identity and bank via Stripe-hosted flow), then create transfers and payouts |
| Stripe Treasury | "No minimums or monthly fees" on the general pricing page. Treasury is for holding funds; it is a banking product with extra eligibility [unverified] | Same as above | [unverified] | High |
| Dwolla | Custom, quote only. Page says "purpose-built for platforms and enterprises running high volumes of bank payments" and gives no minimum, plan or fee [read today] | Bank data, ACH origination | Not stated | Medium to high, sales-gated |
| Bank bill-pay / NACHA upload | Bank's own fee (unverified, varies) | Nothing: it is today's model | Needs the bar's bank to offer ACH origination | Already built |

Stripe ACH numbers on the general pricing page, for reference: domestic ACH payouts $0.50 next-day, $1.00 same-day after 50 free monthly; ACH direct debit 0.8% capped at $5 [read today, stripe.com/pricing]. Stripe does not file payroll taxes; withholding would stay Rail's computation and the bar's legal duty.

## 3. Use cases

1. **Bar already has a payroll provider.** The most common serious bar. Rail should not move money at all. It should produce hours, tips and tip-pool results in a form that provider can take. Cheapest, safest, and removes custody of bank data entirely for these bars.
2. **Bar pays by cheque or cash.** No bank data is needed. The pay-run snapshot already records what was owed and `payouts.ts` records what was handed over. Nothing to replace; this path simply needs the bank-data feature to be optional.
3. **Bar wants one button.** The only case that needs a money mover. Real one-button payroll with tax filing means a full provider (Gusto, Square, QuickBooks, or embedded Check). Stripe Connect gives a one-button *payout* but leaves taxes with the bar, which the bar may not understand it is still responsible for.

## 4. Recommendation

**Primary: export-first, stop holding bank data.** Delete employee bank storage and SMS enrolment. Give every bar a payroll export (CSV per employee: regular hours, overtime hours, tips, cash tips, tip-pool share, advances) shaped for Gusto, Square Payroll and QuickBooks import. For "one button", partner by referral with one provider (Square Payroll is cheapest at $35 + $6 and takes Square tips, but check it handles 2Touch bars and pooling; Gusto is the broader fit) rather than building an API integration. Price stays the bar's own provider bill, which is published on the pages above.

**Fallback: Stripe Connect payouts for the one-button bar**, only if a clear written answer from Stripe says wage payouts are allowed. It still removes bank-data custody, but not tax duty.

**Not recommended now: Check or Gusto Embedded** (no public price, sales and contract first, replaces the existing tax engine) and Dwolla (sales gated).

### Tips and pooling in the export
Rail computes the pooled amounts (`tip-pool.ts`, `tip-ledger.ts`), so pass them as final per-person tip amounts, not as a pool for the provider to re-split. Only Toast documents a pooling product; Square imports direct tips from its own POS; Gusto and QuickBooks tip import not confirmed. Expect CSV or manual entry of final per-person tips. Ask each vendor whether pooled tips and cash tips are reported on the W-2 correctly. [unverified]

### What the code keeps, changes, deletes

| | Primary (export) | Fallback (Stripe Connect payouts) |
|---|---|---|
| Keep | `computePayroll`, `lib/payroll/tax/` (still used for the preview and for cheque/cash bars), tip pool and ledger, overtime, `payouts.ts`, run snapshot and approval gate, `ach-net.ts` (net of advances is still the number to pay) | Same, plus `payouts.ts` as the ledger |
| Change | Payroll tab gets an export screen; payouts ledger records "paid in external provider"; privacy page and settings copy | New Stripe connected-account onboarding per employee; payouts written through a Stripe transfer with an idempotency key (reuse `ux_payroll_payout_idempotency`); webhook for `payout.failed` and `paid` |
| Delete | `app/api/payroll/nacha/`, `lib/payroll/nacha.ts`, `lib/direct-deposit/` (crypto, sms, routing), `direct-deposit-service/`, `direct_deposit_accounts` data and RPC (migration, owner to apply, after export of any needed data), `DD_ENCRYPTION_KEY`, Twilio use for OTP, ODFI settings | The same deletions; custody then moves to Stripe |

Deleting stored bank data is a migration and a data-destruction decision for the owner. I did not touch it.

## 5. Open questions for vendors and an accountant (all unverified)

1. Stripe: are employee wage payouts allowed under Connect, for a platform with no legal entity, paying individuals?
2. Square Payroll and Gusto: can tips be imported by CSV, and how are pooled and cash tips reported?
3. Does a bar need an EIN for each, and may Rail refer customers without an entity? Do any require Rail to be a registered partner?
4. Check: price per employee, minimum volume, and whether tips are a supported earning type.
5. Who is liable, Rail or the bar, if an exported figure is wrong?

## 6. Pages that could not be read

- Gusto: gusto.com/product/pricing, /product/embedded-payroll, /about/bd/gusto-embedded-payroll returned 403. Gusto prices come from search snippets of its pages and tech.co.
- Check: checkhq.com/pricing returned 404; no public price found.
- Toast: pos.toasttab.com/products/payroll returned 403; Toast figures are from search snippets and third parties.
- Stripe sole-proprietor support pages: seen through search snippets only.
