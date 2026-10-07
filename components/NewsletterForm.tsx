'use client';

import { useState } from 'react';

/** Newsletter signup form: POSTs to /api/newsletter, handles dedupe message. */
export function NewsletterForm({ source = 'site' }: { source?: string }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'loading') return;
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (res.ok && data.ok) {
        setStatus('done');
        setMessage(data.message || 'Subscribed.');
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Please try again.');
    }
  }

  if (status === 'done') {
    return (
      <p role="status" className="rounded-xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800">
        {message || 'You are subscribed.'} Welcome aboard! 🐾
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md">
      <label htmlFor={`newsletter-email-${source}`} className="sr-only">
        Email address
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={`newsletter-email-${source}`}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          disabled={status === 'loading'}
          className="flex-1 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/60 focus:border-white focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-brand-800 hover:bg-brand-50 disabled:opacity-60"
        >
          {status === 'loading' ? 'Joining…' : 'Join free'}
        </button>
      </div>
      {message && (
        <p role={status === 'error' ? 'alert' : 'status'} className="mt-2 text-sm text-white/90">
          {message}
        </p>
      )}
      <p className="mt-2 text-xs text-white/70">
        One short email a week. Unsubscribe anytime.
      </p>
    </form>
  );
}
