'use client';

import { useEffect, useState } from 'react';

/**
 * Contact form with honeypot (website) + time-trap token.
 * Fetches a signed token from /api/contact/token and submits it as ?token.
 */
export function ContactForm() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/contact/token')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { token?: string } | null) => {
        if (!cancelled && data?.token) setToken(data.token);
      })
      .catch(() => {
        /* form stays submittable; server still validates */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function ensureToken(): Promise<string | null> {
    if (token) return token;
    try {
      const res = await fetch('/api/contact/token');
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string };
      if (data.token) {
        setToken(data.token);
        return data.token;
      }
    } catch {
      /* server will reject with a clear message */
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'loading') return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    setStatus('loading');
    setMessage('');
    try {
      const freshToken = await ensureToken();
      const url = freshToken
        ? `/api/contact?token=${encodeURIComponent(freshToken)}`
        : '/api/contact';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(formData.get('name') ?? ''),
          email: String(formData.get('email') ?? ''),
          subject: String(formData.get('subject') ?? ''),
          message: String(formData.get('message') ?? ''),
          website: String(formData.get('website') ?? ''),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setStatus('done');
        form.reset();
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
      <p role="status" className="rounded-xl bg-brand-50 px-5 py-4 font-medium text-brand-800">
        Thanks — your message is on its way. We usually reply within 2 business
        days. 🐾
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="mb-1 block text-sm font-semibold text-ink">
            Name
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            required
            maxLength={100}
            autoComplete="name"
            className="w-full rounded-xl border border-ink/20 bg-white px-4 py-2.5 text-sm text-ink focus:border-brand-600 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="mb-1 block text-sm font-semibold text-ink">
            Email
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            className="w-full rounded-xl border border-ink/20 bg-white px-4 py-2.5 text-sm text-ink focus:border-brand-600 focus:outline-none"
          />
        </div>
      </div>
      <div>
        <label htmlFor="contact-subject" className="mb-1 block text-sm font-semibold text-ink">
          Subject
        </label>
        <input
          id="contact-subject"
          name="subject"
          type="text"
          required
          maxLength={150}
          className="w-full rounded-xl border border-ink/20 bg-white px-4 py-2.5 text-sm text-ink focus:border-brand-600 focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="contact-message" className="mb-1 block text-sm font-semibold text-ink">
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={6}
          maxLength={5000}
          className="w-full rounded-xl border border-ink/20 bg-white px-4 py-2.5 text-sm text-ink focus:border-brand-600 focus:outline-none"
        />
      </div>
      {/* Honeypot: invisible to humans, bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="contact-website">
          Website (leave blank)
          <input
            id="contact-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>
      {message && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'loading'}
        className="rounded-xl bg-brand-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {status === 'loading' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
