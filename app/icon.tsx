import { ImageResponse } from 'next/og';

/**
 * App icon, generated rather than checked in as a binary.
 *
 * Keeps the mark in the same place as the rest of the design tokens: change the
 * palette and the icon follows, instead of drifting until someone notices the
 * favicon is still the old teal.
 *
 * Rendered by Satori — flexbox subset only, no Tailwind, no external assets.
 */
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // --sidebar, the deep navy the app's chrome uses.
          background: '#0E1729',
        }}
      >
        {/* The "rail" itself: three stacked bars, densest at the base. Reads as
            a mark at 512px and still as a shape at 32px in a browser tab. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
          {[300, 220, 140].map((w) => (
            <div
              key={w}
              style={{
                display: 'flex',
                width: w,
                height: 58,
                borderRadius: 12,
                background: '#7EA6FF',
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
