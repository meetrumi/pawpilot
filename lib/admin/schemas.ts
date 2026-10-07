// Zod schemas for every /api/admin/* route. Server-side only.

import { z } from 'zod';

/** "" -> null for optional URL/text fields coming from HTML forms. */
const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), schema.nullable());

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(512),
  token: z.string().trim().max(32).optional(),
  rememberMe: z.boolean().optional(),
});

/** Team (child admin user) management — super-admin only. */
export const teamUserCreateSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dots, underscores, or hyphens.'),
  password: z.string().min(8).max(128),
  isActive: z.boolean().optional(),
});

export const teamUserUpdateSchema = z.object({
  // Reset the password to a new one.
  password: z.string().min(8).max(128).optional(),
  // Activate / deactivate the account.
  isActive: z.boolean().optional(),
});

export const postStatuses = ['draft', 'review', 'scheduled', 'published'] as const;

const faqItemSchema = z.object({
  q: z.string().trim().min(1).max(500),
  a: z.string().trim().min(1).max(5000),
});

/** Shared create/update body for posts. `markdown` is converted to sanitized HTML server-side. */
export const postWriteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug may only contain lowercase letters, numbers and dashes.'),
  metaTitle: z.string().trim().min(1).max(60),
  metaDescription: z.string().trim().min(1).max(155),
  excerpt: z.string().trim().min(1).max(400),
  markdown: z.string().min(1).max(300_000),
  categoryId: z.string().min(1).max(64),
  authorId: z.string().min(1).max(64),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  status: z.enum(postStatuses),
  scheduledFor: emptyToNull(z.string().datetime({ offset: true }).max(64)),
  featuredImageUrl: emptyToNull(z.string().url().max(2000)),
  featuredImageAlt: emptyToNull(z.string().trim().max(200)),
  secondaryImageUrl: emptyToNull(z.string().url().max(2000)),
  secondaryImageAlt: emptyToNull(z.string().trim().max(200)),
  secondaryImageAfterHeading: emptyToNull(z.string().trim().max(160)),
  faq: z.array(faqItemSchema).max(20).default([]),
  keyTakeaways: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
  canonicalUrl: emptyToNull(z.string().url().max(2000)),
  noindex: z.boolean().default(false),
});

export type PostWriteInput = z.infer<typeof postWriteSchema>;

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug may only contain lowercase letters, numbers and dashes.')
  .optional();

export const categoryWriteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugField,
  description: z.string().trim().min(1).max(2000),
});

export const tagWriteSchema = z.object({
  name: z.string().trim().min(1).max(60),
  slug: slugField,
});

export const authorWriteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugField,
  bio: z.string().trim().min(1).max(5000),
  role: z.string().trim().max(120).default('Contributor'),
  credentials: emptyToNull(z.string().trim().max(300)),
  email: emptyToNull(z.string().email().max(200)),
  avatarUrl: emptyToNull(z.string().url().max(2000)),
});

export const topicStatuses = ['pending', 'approved', 'rejected', 'used'] as const;

export const topicCreateSchema = z.object({
  keyword: z.string().trim().min(1).max(300),
  secondaryKeywords: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  searchIntent: z.string().trim().max(60).default('informational'),
  rationale: z.string().trim().min(1).max(5000),
  categoryId: emptyToNull(z.string().min(1).max(64)),
});

export const topicPatchSchema = z
  .object({
    action: z.enum(['approve', 'reject', 'move-top']).optional(),
    status: z.enum(topicStatuses).optional(),
  })
  .refine((v) => v.action !== undefined || v.status !== undefined, {
    message: 'Provide an action or a status.',
  });

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const agentSettingsSchema = z.object({
  agent_enabled: z.boolean(),
  agent_mode: z.enum(['review-first', 'full-auto']),
  posts_per_day: z.number().int().min(1).max(10),
  publish_times: z.array(z.string().regex(HHMM, 'Use HH:MM 24-hour format.')).min(1).max(10),
  timezone: z.string().min(1).max(80),
  tone_instructions: z.string().trim().min(1).max(8000),
  banned_words: z.array(z.string().trim().min(1).max(80)).max(300),
  word_count_target: z.number().int().min(300).max(6000),
  refresh_enabled: z.boolean(),
});

export type AgentSettingsInput = z.infer<typeof agentSettingsSchema>;

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MiB
export const ALLOWED_UPLOAD_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const settingsWriteSchema = z
  .object({
    site_name: z.string().trim().min(1).max(120),
    site_tagline: z.string().trim().max(200),
    logo_text: z.string().trim().max(60),
    contact_email: z.string().trim().email().max(200),
    seo_default_title_suffix: z.string().trim().max(80),
    seo_default_description: z.string().trim().max(200),
    ads_enabled: z.boolean(),
    adsense_client_id: z.string().trim().max(60),
    newsletter_enabled: z.boolean(),
  })
  .partial();

export const inboxPatchSchema = z.object({
  status: z.enum(['new', 'read', 'replied', 'spam']),
});
