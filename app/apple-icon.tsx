import { ImageResponse } from 'next/og';

/**
 * Home-screen icon for iOS.
 *
 * Separate from `icon.tsx` because iOS does not round or pad the image itself —
 * it renders the square as given and applies its own mask, so the mark needs
 * more breathing room than the browser-tab version to survive the corner clip.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0E1729',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {[92, 68, 44].map((w) => (
            <div
              key={w}
              style={{
                display: 'flex',
                width: w,
                height: 20,
                borderRadius: 5,
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
