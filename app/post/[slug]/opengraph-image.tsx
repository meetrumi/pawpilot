import { ImageResponse } from 'next/og';
import { getPostBySlug } from '@/lib/data';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Per-post branded OG image: post title + PawPilot brand bar. */
export default async function PostOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  // Satori has no line-clamp: shorten long titles in JS instead.
  const rawTitle = post?.title ?? 'PawPilot';
  const title =
    rawTitle.length > 90 ? `${rawTitle.slice(0, 87).trimEnd()}…` : rawTitle;
  const category = post?.category.name;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: '#faf8f3',
          color: '#1f2937',
          fontFamily: 'system-ui, sans-serif',
          padding: '80px',
        }}
      >
        {category && (
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 4,
              color: '#4a6b39',
              marginBottom: 24,
            }}
          >
            {category}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            fontSize: title.length > 70 ? 52 : 64,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: -1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginTop: 48,
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          <span style={{ fontSize: 44 }}>🐾</span>
          <span>
            Paw<span style={{ color: '#4a6b39' }}>Pilot</span>
          </span>
          <span style={{ color: '#5b6472', fontWeight: 400, fontSize: 28 }}>
            · Happy pets, confident owners.
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
