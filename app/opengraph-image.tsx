import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'PawPilot — Happy pets, confident owners.';

/** Default branded OG image (1200×630). */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2b3b23',
          color: '#faf8f3',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 110 }}>🐾</div>
        <div
          style={{
            display: 'flex',
            fontSize: 84,
            fontWeight: 800,
            letterSpacing: -2,
          }}
        >
          Paw<span style={{ color: '#a4c194' }}>Pilot</span>
        </div>
        <div style={{ fontSize: 36, marginTop: 16, color: '#e4ecdf' }}>
          Happy pets, confident owners.
        </div>
      </div>
    ),
    { ...size },
  );
}
