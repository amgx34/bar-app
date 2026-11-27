# Clover: owner steps

Status: built, tested against fixtures, never run against a real or sandbox Clover account. Everything marked "to confirm" below is from Clover's documentation, not from a live response.

Rail reads Clover (sales, tips, cash and card split, items sold, hourly and per-server sales, employees and shifts). It never writes to Clover and never stores a Clover password. The login Rail holds is an OAuth token pair, encrypted in `pos_credentials`.

## 1. Apply the migration (dev first, then live)

`supabase/migrations/20261125000050_pos_credentials.sql` creates the encrypted credentials table. Nobody has applied it. Apply it to the dev project, check a connect and a sync, then apply it to live. Until it is applied the app still works: tokens are stored encrypted in `pos_config.credentials_enc`, without compare-and-swap. That path is a fallback. Clover refresh tokens are single use, so two overlapping syncs can strand a connection on it. Apply the migration before a real bar connects.

## 2. Clover developer account and app

1. Create a developer account at https://sandbox.dev.clover.com (sandbox) and, for real bars, https://www.clover.com/developers.
2. Create an app. Choose the web app type (OAuth 2.0 code flow).
3. Permissions (read only): Orders, Payments, Merchant, Inventory, Employees. Add shifts or cash events if the app settings list them. To confirm: which permission each of shifts and cash events needs.
4. Site URL: the Rail production URL. Default OAuth redirect (REST) URL: `https://<your-domain>/api/clover/callback`. It must match `CLOVER_REDIRECT_URI` exactly.
5. Copy the App ID and App Secret.

## 3. Environment variables (Vercel, and `.env.local` for dev)

| Variable | Value |
|---|---|
| `CLOVER_CLIENT_ID` | the App ID |
| `CLOVER_CLIENT_SECRET` | the App Secret |
| `CLOVER_REDIRECT_URI` | `https://<your-domain>/api/clover/callback` |
| `OAUTH_STATE_SECRET` | a long random string; `openssl rand -hex 32`. Signs the OAuth state so a forged link cannot attach someone else's merchant to a bar |
| `DD_ENCRYPTION_KEY` | already set for direct deposit; the same key encrypts the tokens |
| `CLOVER_SANDBOX` | `true` to force sandbox hosts. Leave unset in production |
| `CLOVER_API_REGION` | optional default (`na`, `eu`, `la`) when a bar has not chosen one |
| `CLOVER_WEBHOOK_KEY` | optional, see section 6 |
| `CRON_SECRET` | already required for the daily cron |

## 4. Sandbox test

1. Set `CLOVER_SANDBOX=true` and the variables above.
2. In the sandbox dashboard, create a test merchant and add a few orders with a cash and a card payment, one tip, one refund.
3. In Rail, Settings, POS, choose Clover. Pick the business-day cutoff hour (default 4) and authorize as the test merchant.
4. Press Sync now. Check Dashboard, Sales and Inventory against the sandbox orders.
5. Open the Z totals for one night and compare to the sandbox payments by hand: net sales exclude tax and tip; cash plus card should equal the payments.
6. Revoke the app on the sandbox merchant and press Sync now again. Rail should show "Reconnect Clover".

To confirm in this step: token host and request encoding, the units of the token expiry fields, whether `payment.amount` includes tax, the merchant time zone field, page-size limits, whether a tip adjustment bumps `modifiedTime`. The code fails visibly (a sync error in plain words) rather than guessing when a response does not match.

## 5. Approval before a real merchant can install

A Clover app in the sandbox can only be installed on sandbox merchants. A real bar can install it only after Clover approves the app for the Clover App Market, or after you share a private install link for a not-yet-listed app (to confirm which Clover allows for this app type). Allow weeks for review. Do not promise a bar a connection date before this is done.

## 6. Optional webhook

Set `CLOVER_WEBHOOK_KEY` to a random string. In the Clover app settings, set the webhook URL to `https://<your-domain>/api/clover/webhook` and subscribe to order and payment events. Clover posts a verification code once; Rail logs it (Vercel function logs, `[clover/webhook] verification code`). Enter it in the Clover dashboard. Clover sends the key back in the `X-Clover-Auth` header on each event.

The webhook is a hint only. The payload holds ids, so an event just triggers a refetch of the last day. The nightly cron and the on-open refresh do not depend on it. Without the variable the route returns 404.

## 7. When it runs

Daily at 13:00 UTC with the other cron work (one bar's failure does not stop the others), when someone opens the app and the last sync is over 30 minutes old, and on Sync now (refused inside two minutes of the last sync). It is not a live feed.

## 8. Before trusting a bar's numbers

Compare three printed Z reports from the bar to Rail's nights, to the cent: net sales, tips, cash, card. Record the result in `docs/go-to-market/claims-register.md` (A22). Only after that does Clover go back on the public front page.
