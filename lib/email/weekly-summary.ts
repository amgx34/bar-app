import { weeklyLines, type WeeklySummary } from '@/lib/notifications/detect';

/**
 * The weekly owner email. Pure: summary in, subject/html/text out.
 *
 * Bar totals only, by construction: WeeklySummary has no field for a name or
 * a wage. Colours follow the reader's light/dark setting; clients that ignore
 * the media query show the light version, which is the safe fallback.
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderWeeklyEmail(s: WeeklySummary, siteUrl: string): { subject: string; html: string; text: string } {
  const link = `${siteUrl.replace(/\/$/, '')}/app/dashboard`;
  const lines = weeklyLines(s);
  const subject = `Your week at the bar: ${s.salesText === 'not reported' ? 'no sales reported' : s.salesText}`;

  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<style>
body{margin:0;background:#f4f6fa;color:#111827;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.card{max-width:520px;margin:0 auto;padding:24px 16px}
.panel{background:#ffffff;border-radius:12px;padding:20px}
h1{font-size:20px;margin:0 0 4px}
.muted{color:#4b5563;font-size:14px;margin:0 0 16px}
li{font-size:16px;line-height:1.5;margin:0 0 8px}
.btn{display:inline-block;margin-top:12px;padding:12px 20px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px}
@media (prefers-color-scheme: dark){
body{background:#0b1220;color:#f3f4f6}.panel{background:#111a2e}.muted{color:#a8b3c7}.btn{background:#6b9bff;color:#0b1220}
}
</style></head><body><div class="card"><div class="panel">
<h1>Your week at the bar</h1><p class="muted">${esc(s.weekLabel)}</p>
<ul style="padding-left:20px;margin:0">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
<a class="btn" href="${esc(link)}">Open Rail</a>
</div><p class="muted" style="margin-top:16px">Turn this off in Settings, Notifications.</p></div></body></html>`;

  const text = `Your week at the bar (${s.weekLabel})\n\n${lines.join('\n')}\n\nOpen Rail: ${link}\nTurn this off in Settings, Notifications.`;
  return { subject, html, text };
}
