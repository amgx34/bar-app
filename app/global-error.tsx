'use client';

import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';
import { errorHome } from '@/lib/nav/error-home';

// Replaces the root layout, so globals.css and Tailwind are not loaded: styles are inline.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  // No router hooks here: the router may be what broke.
  const home = errorHome(typeof window === 'undefined' ? '' : window.location.pathname);
  return (
    <html lang="en">
      <body>
        <title>Something went wrong</title>
        <style>{`
          body{margin:0;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a}
          main{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
          div{max-width:28rem;text-align:center}
          h1{font-size:1.75rem;margin:0}
          p{color:#475569;line-height:1.6}
          .row{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:32px}
          .btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 24px;border-radius:12px;font:600 1rem system-ui,sans-serif;text-decoration:none;cursor:pointer}
          .primary{background:#0f766e;color:#fff;border:1px solid #0f766e}
          .secondary{background:transparent;color:inherit;border:1px solid #64748b}
          small{display:block;margin-top:8px;color:#475569}
          a:not(.btn){color:inherit}
          @media (prefers-color-scheme:dark){
            body{background:#0b1120;color:#f1f5f9}
            p,small{color:#cbd5e1}
            .primary{background:#2dd4bf;color:#042f2e;border-color:#2dd4bf}
            .secondary{border-color:#94a3b8}
          }
        `}</style>
        <main>
          <div role="alert">
            <h1>Something went wrong on our end</h1>
            <p>The app did not load. Nothing you entered has been lost. Try again, and if it keeps happening, use the other button to start over.</p>
            <div className="row">
              <button type="button" className="btn primary" onClick={() => unstable_retry()}>Try again</button>
              {/* plain anchor: the router may be what broke */}
              <a className="btn secondary" href={home.href}>{home.label}</a>
            </div>
            <p>Still stuck? Email <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.</p>
            {error.digest && <small>Reference code: {error.digest}</small>}
          </div>
        </main>
      </body>
    </html>
  );
}
