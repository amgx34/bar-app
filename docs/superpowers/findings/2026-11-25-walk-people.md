# Task 9 walk: People and pay slice (2026-11-25)

Routes: `/app/payroll`, `/app/payroll/employees`, `/app/payroll/direct-deposit`, `/app/payroll/review`, `/app/payroll/split`, `/app/employees`, `/app/tips` (4 tabs), `/app/tax` (3 tabs).
Viewports: 1280x800 and 390x844. Playwright + system Chrome, seeded demo org session cookie.
Pre-flight: the dev server printed `uzmnjtsvayoqcvlhmxbx.supabase.co`. `.env.local` points at `nmisjwnyhjosppkwkckx.supabase.co`, so the hosts differ. All writes below went to the DEV project.
Scripts: `scratchpad/pw/people-*.mjs`. Screenshots: `scratchpad/walk-shots/people-*` (walk) and `people-act-*` (actions).

## Walk results (all 8 routes, both viewports)

| Route | Final URL | HTTP | Console errors | Failed requests | Primary content | Horizontal scroll |
|---|---|---|---|---|---|---|
| /app/employees | /app/payroll/employees (redirect) | 200 | none | none | yes | no |
| /app/payroll | same | 200 | none | none | yes (Day view: "No shift data for Wed Nov 25") | no |
| /app/payroll/direct-deposit | same | 200 | none | none | yes | no |
| /app/payroll/employees | same | 200 | none | none | yes (7 employees) | no |
| /app/payroll/review | same | 200 | none | none | yes (2 employees, $507.00) | no |
| /app/payroll/split | /app/payroll (redirect) | 200 | none | none | yes | no |
| /app/tax | same | 200 | none | none | yes (W-2 form tab) | no |
| /app/tips | same | 200 | none | none | yes | no |

Mobile first-load screenshot of `/app/tips` showed an empty chart. That was the draw-in animation: after 4 seconds the line renders (`people-tips-chart-390.png`). Not a defect.
Per-page counts from the walk: 1 h1 everywhere, no unnamed buttons or links. Controls under 24px: 10 on employees at desktop, 5 on tax. Unlabelled inputs: 1 on employees and payroll, 3 on tax.

## Findings

| Route | Viewport | What happened | Severity | Suspected cause |
|---|---|---|---|---|
| /app/payroll (week view, "Pay remaining") | both (logic, seen at 1280) | After "Pay remaining 6" (toast "Paid 6 people, $6,899.75") the payout bar reads "Paid out 5 of 7, Pay remaining 2, advanced $3,046.11, still owed $0.01". Wes Berns and Jordan Park show an amber "$2654.88 of $2654.88" badge instead of the green paid badge. Reopening the dialog says "7 already settled and not listed, Pay 0 people". The two parts of the screen disagree, and persist after reload. | P1 | `summarizePayouts` in `lib/payroll/payouts.ts` tests `balance <= 0` with no tolerance. `planBulkPayout` tests `balance <= 0.005`. A sub-half-cent float residue in `totalCompensation` leaves the summary seeing a balance. Money: owner to decide, not fixed here. |
| /app/payroll (day and week), /app/tax | both | Tips distributed exceed tips the POS reported. 2026-11-19 day view: header TIPS $1,596.00 but TOTAL TIPS $1,212.00. 11-20: $2,160 vs $1,584. Week 11-16 to 11-22: payroll tips $5,349.00 vs Tips page week total $4,389.00 (difference $960.00). November: payroll tips $10,208.00 vs Tips page total $8,416.00 excluding my test $12.34 (difference $1,792.00, exactly Danny Rivera's total tips on the Flags tab). Tax Report "total tips" shows $8,428.34 for the whole year, less than one month of payroll tips. Looks like the individual-mode bartender's tips are added on top of the Z total instead of being part of it. May be a demo-seed artifact; cannot tell from the UI. | P1 (P0 if not a seed artifact) | Unconfirmed. Payroll tip allocation (`computePayroll`) vs `z_report_days.cash_tips + cc_tips` (`app/(app)/app/tax/actions.ts` line 130). Money and tips: owner to review. |
| /app/payroll/employees | both | Deleting an employee: native confirm accepted, toast "Walk Test removed", but the row is still listed, including after a hard reload (count stays 8). No error shown. | P1 | `deleteEmployee` uses the cookie-scoped client with `.delete().eq(...)`. A delete that RLS filters to zero rows returns no error, and the UI treats that as success. Possibly no DELETE policy on `employees`. |
| /app/tax (Tax Report) | both | "FUTA ~$336.00" for "8 employees" is a flat $42 per employee regardless of wages. It counts Walk Test ($0 wages) and Lisa Taylor ($288 wages) the same as Wes ($5,080). | P2 | `futatEstimate = count * 7000 * 0.006` in `app/(app)/app/tax/actions.ts` line 176 has no `min(wages, 7000)`. Money estimate: owner to review. |
| /app/tax (W-2 and 1099-NEC) | 1280 | W-2 generation succeeded with EIN, address, ZIP, state all empty. It produced a W-2 for an employee with $0.00 wages. 1099 "Load Workers" listed 6 bartenders/security as contractors even though the banner says regular staff get W-2s, and every employee is still "Unclassified". | P2 | No validation on employer fields. No filter on zero wages. 1099 list does not filter on the tax classification field. |
| /app/payroll, direct-deposit, tax | both | Warning text is pale yellow on cream ("Phone number required" body, Legal Disclaimer body). Very low contrast, hard to read. | P2 | Warning token colour used for body text on a tinted background. |
| /app/tips?tab=well | 390 | Page scrolls sideways (scrollWidth 436 vs 390). The "Options" button is cut off the right edge of the date row. | P2 | Date row does not wrap or shrink at phone width. |
| /app/payroll/direct-deposit, other server actions | both | Validation failures are thrown from server actions. Invalid phone returns 500 plus console error; the toast still reads "Phone must be in E.164 format". SMS send returns 500, toast "SMS delivery failed: Authentication Error - invalid username" (Twilio key blank/invalid in dev, fails safely, nothing sent). In a production build Next replaces thrown messages with a generic one, so these toasts may lose their text. | P2 | `saveAdminPhone` and `sendOTPSms` throw `Error`. Return a result object instead. |
| /app/payroll (week view) | 1280 | "Undo" on a recorded payout removes it immediately, with no confirmation (toast "Removed cash payment"). | P3 | One-click delete of a money record. |
| /app/payroll (week view) | 1280 | A "Mark paid" button is offered on a $0.00 row (Walk Test, 0 hours). | P3 | No guard on zero balance in the row control. Bulk planner does skip zero balances. |
| /app/payroll (Day view) | both | "Run Payroll" from a past day opens the review for the current week, not the week of the day being viewed. Week and Month views carry the range correctly. | P3 | `RunPayrollLink` reads only `startDate`/`endDate`; Day view uses `date`. |
| /app/payroll/review | both | Duplicated chrome: "Back" and "Payroll" breadcrumb and a second "< Payroll" link; "Payroll Review" bar and "Pay Period Review" heading; CSV and NACHA buttons at top and again at bottom. | P3 | Two layers (layout header plus page header) both render. |
| /app/payroll (banner, dialogs, toasts) | both | ISO dates in user text: banner "2026-11-23 to 2026-11-29 is awaiting your approval", Pay everyone dialog "2026-11-16 to 2026-11-22", toasts "added to 2026-11-17" and "cash tips logged for 2026-11-25". Banner total "$507" has no cents while the page shows "$507.00". | P3 | Raw strings and unformatted numbers interpolated into copy. |
| /app/payroll (Day view) | 1280 | After saving cash tips, the dialog stayed open at 3 seconds. A night with cash tips and no sales then shows 0.0% on Tip Totals and plots a 0% point (the line drops off a cliff) on the Tips analytics chart. | P3 | Dialog not closed on success. Tip % for zero-sales night not excluded. |
| /app/tips (Analytics) | 1280 | Chart y-axis starts at 18% rather than 0, so 18% nights sit on the baseline and look like zero. Axis spans only 18% to 21.6%. | P3 | Auto-scaled y domain. |
| /app/tips?tab=well | both | Expected $ shows $0.00 for every well for a moment before $235.71 appears. | P3 | No loading state for the expected figure. |
| /app/payroll/review | 1280 | NACHA download with no bank routing or EIN set returns 422, the page shows the toast "Add your bank routing number and company EIN in Settings..." and the browser logs a console error. | P3 | Fails safely and the message is clear; the 422 is only console noise. |
| /app/payroll/review | 1280 | After "Resubmit for approval" the status still read "Changes requested" 3 seconds later. A reload showed the Approve button, so the write did happen. | P3 (unconfirmed) | Possibly the UI is not refreshed after resubmit. I did not repeat it. |
| /app/employees, /app/payroll/split | both | Both redirect (to /app/payroll/employees and /app/payroll). Recorded for the route inventory. | info | Legacy routes redirected. |

## Actions exercised on DEV

Worked as expected:
- Add employee: empty name refused ("Please enter a name"), blank rate refused ("Please enter a valid hourly rate"), valid record created.
- Edit employee: rate change from 12.50 to 14.00 saved.
- Tax setup panel: tip-method radio, state-withholding checkbox, pay frequency and state rate all save ("Tax setup saved"). Rates 150 and -3 refused ("State rate must be a percentage from 0 to 100"). Withhold-taxes stays disabled until a pay frequency is chosen.
- Pay Period: Day, Week and Month switching. Add someone to a shift (Walk Test, 5 hours on 11-17: totals moved from 183.5 to 188.5 hours, then Remove-from-shift returned them to 183.5). Adjust dialog opens. Mark paid (Danny Rivera, $1,192.50 cash). Pay remaining 6 people (written; see the first finding for the display problem). Undo payment (Mike Santos).
- Cash tips: $12.34 logged for 11-25 and persisted across reload.
- Review: CSV downloads (`payroll-2026-11-23-to-2026-11-29.csv`). Submit for approval, Send back (button disabled until a note is typed, note shown), Resubmit, Approve ("ACH export is unlocked for this period"), Confirm Payroll ("Payroll confirmed for this period..."). NACHA refused while bank settings are blank (see above).
- Direct deposit: phone save works (E.164 enforced). Set Up dialog keeps "Send Verification Code" disabled until bank fields and consent are filled. Send fails safely with the Twilio error; no SMS, nothing stored.
- Tax: W-2 generate (8 W-2s, totals sum to $15,559.75, equal to the payroll November total), 1099 load, Tax Report generate (revenue $50,828.34, labor $6,097.16).
- Tips: all four tabs load. Flags flags Danny Rivera (32.0% vs bar mean 20.0%).

## Test data left behind in the DEV project

- Employee "Walk Test" (bartender, $14.00/hr, pool). Delete is broken (finding 3), so it cannot be removed from the UI. A shift-removal adjustment row for Walk Test on 2026-11-17 also remains.
- Payroll run for 2026-11-23 to 2026-11-29: submitted, sent back, resubmitted, approved, confirmed.
- Payouts for 2026-11-16 to 2026-11-22: cash payouts recorded for Danny, Kayla, Wes, Alex, Jordan, Lisa. Mike Santos's was undone, so Mike shows unpaid.
- Cash tips $12.34 on 2026-11-25 (manual).
- Tax setup: pay frequency set to Weekly. Tip method, state withholding and state rate were set back to their starting values.
- Direct-deposit admin phone saved as +15555550100.
- Notifications fired for the pay run (bell count rose to 4).

## Not done

- Did not click through "Set all tips" bulk change (would rewrite every employee's tip mode; only the confirm text was seen in source).
- Not exercised: W-2 and 1099 "Print" (popup/PDF), 1099 selection, Tax Report with a state selected, Adjust tabs other than Remove (Hours, Move tips, Opener, Cash out, Unlock), Day-view hours dialog, CSV and Z-report upload and Parse in the Import panel, Well assignment, Tip Totals date navigation, employee tax-classification editing.
- Direct deposit past the SMS step could not be reached: Twilio credentials are blank or invalid in dev, so no code can be sent.
- Cannot say from the UI whether the tips discrepancy (finding 2) comes from the demo seeder or from allocation logic; I did not read `computePayroll` or the seeder.
- No application source was edited, nothing was committed or staged.
