# Toast: owner steps

Status: built, tested against fixtures, never run against a real or sandbox Toast account. Everything marked "to confirm" is from Toast's documentation, not a live response.

Rail reads Toast (sales, tips, cash and card split, items sold, hourly and per-server sales, employees and shifts). It never writes to Toast. The client credentials and the cached access token are encrypted in `pos_credentials`, not in `pos_config`.

## 1. Apply the migration (dev first, then live)

Same migration as Clover: `supabase/migrations/20261125000000_pos_credentials.sql`. Not applied anywhere yet. The app works without it through the encrypted fallback in `pos_config`, which has no compare-and-swap and no sync lease. Apply it before a real bar connects.

## 2. Get Toast API access (this is the hard part)

Toast sells and approves API access separately from the POS. Each bar (or Rail as a partner) needs read-only API credentials.

1. The bar owner opens Toast Web, Integrations, Toast API access, and asks for standard API access. To confirm: whether a bar can buy it directly, what it costs, and how long approval takes.
2. Ask for a read scope on: Orders, Labor (employees and time entries), Menus, Restaurants. If the credentials are missing one, that feed fails with a plain message naming the permission, and the other feeds still sync.
3. Toast gives a Client ID, Client secret and the restaurant GUID. Copy all three.
4. Rail talks to `https://ws-api.toasttab.com` by default. If Toast issues a different host with the credentials (sandbox or partner), set `TOAST_API_HOST` to it (https only).

## 3. Environment variables

| Variable | Value |
|---|---|
| `DD_ENCRYPTION_KEY` | already set; encrypts the credentials |
| `TOAST_API_HOST` | optional, only if Toast issued a host other than the default |
| `TOAST_AMOUNTS_IN_CENTS` | leave unset. Rail reads Toast amounts as dollars, as Toast's docs show. If a sandbox response shows whole cents, set this to `true` before any real bar syncs |
| `CRON_SECRET` | already required |

There is no Toast app registration, redirect URL or webhook: Toast has no OAuth install for this access level and no webhook at standard access.

## 4. Sandbox test

1. Use Toast sandbox credentials if Toast issues them, with `TOAST_API_HOST` set.
2. Rail, Settings, POS, choose Toast. Only the owner sees the form. Paste Client ID, Client secret and restaurant GUID. Rail logs in and fetches the restaurant before it saves anything, so a typo fails here, not at 3am.
3. Press Sync now. Compare a night against the Toast sales summary: Rail's net sales exclude tax and tip.
4. Check the dollars-versus-cents question first: a $12.00 drink must show as 12, not 0.12 or 1200. This is the one check that must pass before anything else.
5. Change the client secret in Toast, or revoke the credentials, and Sync now. Rail should show "Reconnect Toast".

To confirm: dollars versus cents, whether the selection item guid matches the menu item guid, how ordersBulk paging ends, paging on labor and cash entries, login throttling from shared Vercel addresses (a 429 is reported, never retried in a loop), and whether tips withheld map to tips paid out (Rail sends 0 for now).

## 5. Approval

No app approval. What gates a real bar is Toast agreeing to issue it API credentials. Do not promise a bar a connection date before Toast has done that.

## 6. When it runs

Daily at 13:00 UTC with the other cron work, when someone opens the app and the last sync is over 30 minutes old, and on Sync now (refused inside two minutes of the last sync). Rail logs in to Toast at most once per day per bar and caches the token.

## 7. Before trusting a bar's numbers

Compare three printed Z reports to Rail's nights, to the cent. Record the result in `docs/go-to-market/claims-register.md` (A21). Toast stays off the public front page until then.
