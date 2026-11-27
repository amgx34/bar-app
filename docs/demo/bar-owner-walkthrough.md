# Bar owner walkthrough (about 8 minutes)

Updated 2026-11-27. The audit verdict was **not ready to show an owner** until pay runs, Sales Week and Month, Books and the Count "Matches" button are fixed. If you must show it, follow this shorter script. Details: `docs/superpowers/findings/2026-11-27-universal-demo-results.md`.

Goal: the owner sees their own Friday night on one screen and says "I want that."
Say one sentence per screen, then stop talking. Keep hold of the device or stay beside them; several buttons lead to wrong or confusing screens.

## Before you start (checklist)

- [ ] Use the Try the demo button on the landing page. It opens the shared sample bar at once and does not expire.
- [ ] Check the date on "Last night". It should be yesterday, or the last open night. A daily job moves the sample data up; the dev server has no such job, so run `npm run demo:seed` (dev only) first. Corner Pour showed a date 4 days old in the audit.
- [ ] Dev server running (`npm run dev`, localhost:3000). A deployed URL has not been tested, and refusal messages may differ there. Live also needs the owner seed steps in the results file.
- [ ] Use the laptop. On the phone the bar name is cut to one letter and the notification panel is clipped.
- [ ] Light mode, except Tips (dark reads better). Notifications silenced. Browser zoom 100%.
- [ ] The Sales page adds `?start=...&hour=...` to its address on first load. That is by design.

## Script

1. **Landing page.** "This is Rail. It pulls your sales, stock and payroll into one place." Click Try the demo.
2. **Dashboard.** "Sales, what is low, and what needs your attention, in one glance." Point at Last night and the Stock card. The sample night reads well below average; say it is made-up data. Skip the setup checklist and do not press Hide for now.
3. **Sales.** Day tab only, then the left arrow to a night with a total. "Here is the night, with hours and servers." Do not scroll to Top movers or What sold (empty), do not open Week or Month ($0.00), and do not promise the cash drawer check.
4. **Payroll week.** It opens on today with no data. Switch to Week and step back one week. "Hours and tips turn into what each person is owed." Do not open Review.
5. **Inventory list.** "Everything on the shelf and what is under par." Look only.
6. **Weigh.** Open the saved report. "Weigh the open bottles and see what they are worth." Do not create one.
7. **Reps.** "Each supplier rep with what to reorder from them." You may open the order form. Do not press Send.
8. **Tips.** Totals only. "Pool, individual and barback tips." Leave Well Performance closed.
9. **Switcher.** Tap the bar name at the top. "If you own three bars, you switch here." Tipsy Tavern (owner), Velvet Room Lounge (manager), Corner Pour (owner).

## Do NOT click or promise

- Payroll Review, either pay run, or the bank file: the sample figures show large false changes.
- Books: the sample cost of goods is not believable.
- Sales Week, Month, Tonight, today, or a night with no report.
- Count: do not tap Matches (it blocks saving) or Save.
- Read invoice, AI Import, Log a shipment.
- Any save, delete, send or pay button. Not every refusal explains itself.
- Settings (POS, Billing, Data export, Team, notifications, staff sign-up).
- Add item, Inventory Analytics.
- Clover and Toast: built, never tried on a real account. Say "coming, not proven yet." 2Touch is the working POS link.
- Direct deposit: not offered.
- Sign-up: closed. Do not click Make this my bar. Say "I will set your bar up with you."
- Billing: switched off. Do not quote a price.

## Likely questions

- **Does it work with my POS?** If it is 2Touch, yes today. Clover and Toast are not proven yet.
- **How do the sales get in?** A small program on the POS computer sends them every few minutes. Bars without it get a daily email report.
- **Is my data safe from other bars?** Each bar only sees its own data.
- **What does it cost?** Not decided yet. Say so.
- **Can my bartenders see payroll?** Roles control it. Staff see only their own page.
- **Can I try it with my own numbers?** Yes, after we connect your POS. Sign-up is by invitation for now.
- **What if the internet drops?** It is a website, so you need a connection. Your POS keeps working regardless.

## If something looks wrong

Say "that is sample data" and move to the next step. Do not retry a save.
