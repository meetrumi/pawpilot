// PawPilot SEO utilities: truncation, canonical URLs, and JSON-LD builders.
// Pure functions — no I/O, safe to import anywhere.

/** Canonical site origin from env (SITE_URL, then NEXT_PUBLIC_SITE_URL). */
export function siteUrl(): string {
  const raw =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://pawpilot.com';
  try {
    return new URL(raw).origin;
  } catch {
    return 'https://pawpilot.com';
  }
}

/** Absolute canonical URL for a site path (leading slash optional). */
export function buildCanonical(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${siteUrl()}${p}`;
}

/** Collapse whitespace and cap at 60 chars (Google's title display limit). */
export function truncateTitle(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= 60) return t;
  const cut = t.slice(0, 59);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

/** Collapse whitespace and cap at 155 chars (meta description display limit). */
export function truncateDescription(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= 155) return t;
  const cut = t.slice(0, 154);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > 120 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

export interface ArticleJsonLdInput {
  title: string;
  description: string;
  slug: string;
  imageUrl?: string | null;
  datePublished: string; // ISO
  dateModified: string; // ISO
  authorName: string;
  authorSlug: string;
  authorRole?: string | null;
  categoryName: string;
  wordCount?: number;
}

export function jsonLdArticle(input: ArticleJsonLdInput, site: string) {
  const url = `${site}/post/${input.slug}`;
  const doc: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: input.title,
    description: input.description,
    url,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    author: {
      '@type': 'Person',
      name: input.authorName,
      url: `${site}/author/${input.authorSlug}`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'PawPilot',
      url: site,
      logo: {
        '@type': 'ImageObject',
        url: `${site}/icon.svg`,
      },
    },
    articleSection: input.categoryName,
    inLanguage: 'en',
  };
  if (input.imageUrl) {
    doc.image = [input.imageUrl.startsWith('http') ? input.imageUrl : `${site}${input.imageUrl}`];
  }
  if (input.wordCount && input.wordCount > 0) {
    doc.wordCount = input.wordCount;
  }
  if (input.authorRole) {
    (doc.author as Record<string, unknown>).jobTitle = input.authorRole;
  }
  return doc;
}

export interface BreadcrumbItem {
  name: string;
  url: string; // absolute URL
}

export function jsonLdBreadcrumb(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function jsonLdOrganization(site?: string) {
  const s = site ?? siteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'PawPilot',
    url: s,
    slogan: 'Happy pets, confident owners.',
    logo: `${s}/icon.svg`,
    sameAs: [] as string[],
  };
}

export function jsonLdWebSite(site?: string) {
  const s = site ?? siteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'PawPilot',
    alternateName: 'PawPilot — Happy pets, confident owners.',
    url: s,
    inLanguage: 'en',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${s}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export interface FaqEntry {
  q: string;
  a: string;
}

export function jsonLdFaq(faq: FaqEntry[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a },
    })),
  };
}

export interface PersonJsonLdInput {
  name: string;
  slug: string;
  bio: string;
  role?: string | null;
  credentials?: string | null;
}

export function jsonLdPerson(author: PersonJsonLdInput, site?: string) {
  const s = site ?? siteUrl();
  const doc: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: author.name,
    url: `${s}/author/${author.slug}`,
    description: author.bio,
    worksFor: { '@type': 'Organization', name: 'PawPilot', url: s },
    knowsAbout: ['Pet care', 'Dog training', 'Cat care', 'Pet health'],
  };
  if (author.role) doc.jobTitle = author.role;
  if (author.credentials) doc.description = `${author.bio} Credentials: ${author.credentials}`;
  return doc;
}

/** Props for a JSON-LD <script> tag; escapes `<` to block XSS per Next docs. */
export function jsonLdScriptProps(data: unknown): {
  dangerouslySetInnerHTML: { __html: string };
} {
  return {
    dangerouslySetInnerHTML: {
      __html: JSON.stringify(data).replace(/</g, '\\u003c'),
    },
  };
}
