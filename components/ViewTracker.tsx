'use client';

import { useEffect, useRef } from 'react';

/**
 * Fires a single pageview beacon (POST /api/view) per page load.
 * Uses navigator.sendBeacon so it never blocks navigation.
 */
export function ViewTracker({ postId, path }: { postId: string; path: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    try {
      const payload = JSON.stringify({ postId, path });
      const blob = new Blob([payload], { type: 'application/json' });
      if (!navigator.sendBeacon('/api/view', blob)) {
        // sendBeacon declined (e.g. payload too large) — fall back to fetch.
        fetch('/api/view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* analytics must never break the page */
    }
  }, [postId, path]);

  return null;
}
