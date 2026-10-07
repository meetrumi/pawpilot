'use client';

import { useState } from 'react';

/**
 * Lightweight share buttons: copy-link, X / Facebook / WhatsApp / Telegram
 * share hrefs, plus the native Web Share API when available. No SDKs.
 * The canonical URL is computed on the server and passed in as a prop.
 */
export function ShareButtons({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API unavailable (permissions/policy): fall back to a prompt.
      window.prompt('Copy this link:', url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function nativeShare() {
    if ('share' in navigator) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* user dismissed */
      }
    }
    // No Web Share API — copying the link is the next best thing.
    await copyLink();
  }

  const links = [
    {
      name: 'X',
      href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
    },
    {
      name: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      name: 'WhatsApp',
      href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
    },
    {
      name: 'Telegram',
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
    },
  ];

  const btn =
    'rounded-full border border-ink/15 bg-white px-4 py-1.5 text-sm font-semibold text-ink hover:border-brand-600 hover:text-brand-700';

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Share this article">
      <span className="text-sm font-bold text-ink">Share:</span>
      <button type="button" onClick={copyLink} className={btn} aria-live="polite">
        {copied ? 'Copied ✓' : 'Copy link'}
      </button>
      {links.map((l) => (
        <a
          key={l.name}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className={btn}
          aria-label={`Share on ${l.name}`}
        >
          {l.name}
        </a>
      ))}
      <button type="button" onClick={nativeShare} className={btn}>
        More…
      </button>
    </div>
  );
}
