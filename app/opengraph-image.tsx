import { ImageResponse } from 'next/og';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site';

// Applies to `/` and, by inheritance, every route that doesn't define its own.
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Rendered by Satori, which supports only a flexbox subset of CSS and no
 * external stylesheets — hence the inline styles and explicit display:flex on
 * every container. Keep this self-contained: no Tailwind classes, no imports
 * of app CSS, no remote images.
 */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #080D18 0%, #0E1729 55%, #17264A 100%)',
          padding: 80,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              width: 20,
              height: 20,
              borderRadius: 6,
              background: '#7EA6FF',
            }}
          />
          <span
            style={{
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: 8,
              textTransform: 'uppercase',
              color: '#ffffff',
            }}
          >
            {SITE_NAME}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 78, fontWeight: 900, color: '#ffffff', lineHeight: 1.05 }}>
            The smarter way
          </span>
          <span style={{ fontSize: 78, fontWeight: 900, color: '#7EA6FF', lineHeight: 1.05 }}>
            to run your bar
          </span>
          <span style={{ fontSize: 30, color: 'rgba(255,255,255,0.65)', marginTop: 28 }}>
            Inventory · Payroll · Tips · Z-Report Analytics
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            borderTop: '1px solid rgba(255,255,255,0.15)',
            paddingTop: 28,
            fontSize: 24,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          Built specifically for bar operators
        </div>
      </div>
    ),
    size,
  );
}
