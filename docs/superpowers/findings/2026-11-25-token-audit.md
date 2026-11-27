# Token contrast audit (N4)

Run: `npm run audit:tokens` (scripts/design/check-tokens.ts). 56 pairs, light and dark. No token value was changed.

Math check: the script reproduces the figures documented in globals.css comments (9.90 foreground on background, 7.24 muted-foreground on background, 3.14 border-strong on card).

## Failing pairs

| Theme | Pair | Ratio | Needs |
|---|---|---|---|
| light | border-strong (#7C93B5) on background (#F8FAFC) | 2.997:1 | 3:1 |
| light | input (#7C93B5) on background (#F8FAFC) | 2.997:1 | 3:1 |

Both clear 3:1 on card (3.14:1), which is what the CSS comments claim. They miss by 0.003 when a control sits directly on the page background. The pair on background is the one the manager plan added beyond the CSS comments. Fix is a slightly darker value for `--border-strong` and `--input` (owner call).

All other pairs pass in both themes. Dark: 28/28.
