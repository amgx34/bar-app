# Bar owner walkthrough (10 to 12 minutes)

Goal: the owner sees their own Friday night on one screen and says "I want that."
Say one sentence per screen, then stop talking and let them touch it.

## Before you start (checklist)

- [ ] Open the demo FRESH, within an hour of the meeting. A demo lasts 24 hours and then shows "This demo has ended"; an older one also reports "last night" as days ago. Use the Try the demo button on the landing page (do not reuse an old tab).
- [ ] Dev server running (`npm run dev`, localhost:3000) or the deployed URL. Check it loads on the phone's Wi-Fi.
- [ ] Phone (390 wide) and laptop both signed into the same demo. Start on the phone, it is the screen they will use.
- [ ] Set both to light mode. Notifications silenced. Browser zoom 100%.
- [ ] The Sales page rewrites its address to add `?start=...&hour=...` on first load. That is by design (it reads the bar's own clock). Do not be alarmed by it.
- [ ] "Tonight" on Sales has no number in the demo, because the sample bar has not closed yet. Use the Day tab and the arrows instead (below).

## Script

1. **Landing page.** "This is Rail. It pulls your sales, stock and payroll into one place." Click Try the demo.
2. **Dashboard.** "Last night's sales, what is low, and what needs your attention, in one glance." Point at Last night and the Stock card.
3. **Sales.** Tap the Day tab, then the left arrow to a busy night (around $5,800 to $7,400). "Here is the whole night's total from your close-out report." Say it is a daily total, not hour by hour. Show the drawer card: "It checks the cash drawer against what the till says should be there."
4. **Payroll week.** "Hours and tips turn into what each person is owed." Open one employee row.
5. **Payroll review.** "You sign off before anything is paid, and if the numbers change after, it shows you what moved." Do not press anything that pays.
6. **Inventory list.** "Everything on the shelf and what is under par." Tap the Reorder card.
7. **Inventory count.** "Count on your phone, it fixes the stock numbers." Enter one count only if you want to show it.
8. **Reps.** "Each supplier rep with what to reorder from them." Do not send an order (it sends a real email).
9. **Tips.** "Pool, individual and barback tips worked out the way you already do them."
10. **Books.** "Cost of goods and margins, from what you actually bought and sold."
11. **Settings.** Open it briefly. "Team, roles and your POS connection live here."
12. **Switcher.** Tap the bar name at the top. "If you own three bars, you switch here." (Top bar, next to the Rail logo. Not re-checked on the final build, try it once before the meeting.)

## Do NOT click or promise

- Clover and Toast connections: built, but never tried on a real account. Say "coming, not proven yet." 2Touch is the working POS link.
- Direct deposit: not offered. Payroll gives you the numbers and a bank file only after approval.
- Sign-up: closed. Do not click Make this my bar. Say "I will set your bar up with you."
- Billing: switched off, nothing is charged. Do not quote a price.
- Do not send an order, click Pay remaining, approve a pay run, or press Sync now.

## Likely questions

- **Does it work with my POS?** If it is 2Touch, yes today. Clover and Toast are not proven yet.
- **How do the sales get in?** A small program on the POS computer sends them every few minutes. Bars without it get a daily email report.
- **Is my data safe from other bars?** Each bar only sees its own data.
- **What does it cost?** Not decided yet. Say so.
- **Can my bartenders see payroll?** Roles control it. Staff see only their own page.
- **Can I try it with my own numbers?** Yes, after we connect your POS. Sign-up is by invitation for now.
- **What if the internet drops?** It is a website, so you need a connection. Your POS keeps working regardless.

## If something looks wrong

Say "that is sample data." Refresh once. If the page says "This demo has ended", open a new demo.
