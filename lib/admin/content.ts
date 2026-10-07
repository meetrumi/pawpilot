// Admin content pipeline: Markdown <-> sanitized HTML.
//
// Editor flow (posts):
//   load:  Post.contentHtml --turndown--> Markdown  (edited in md-editor)
//   save:  Markdown --marked--> HTML --sanitize-html--> Post.contentHtml
//
// These helpers are isomorphic: the server uses them when saving posts, and
// the client uses them for the in-admin HTML preview tab.

import { marked } from 'marked';
import TurndownService from 'turndown';
import sanitizeHtml from 'sanitize-html';
import { readingTimeMinutes } from '@/lib/format';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
});

// Turndown has no built-in table support: without this rule, an edit-save
// round trip would silently drop comparison tables (a core PawPilot content
// pattern). Converts <table> back to GFM pipe-table markdown.
turndown.addRule('gfmTable', {
  filter: 'table',
  replacement: (_content: string, node: unknown) => {
    const el = node as unknown as Element;
    const rows = Array.from(el.querySelectorAll('tr'));
    if (rows.length === 0) return '';
    const cellMarkdown = (cell: Element): string =>
      turndown
        .turndown(cell.innerHTML)
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\|/g, '\\|');
    const lines: string[] = [];
    rows.forEach((row, index) => {
      const cells = Array.from(row.querySelectorAll('th, td')).map(cellMarkdown);
      if (cells.length === 0) return;
      lines.push(`| ${cells.join(' | ')} |`);
      if (index === 0 && row.querySelector('th') !== null) {
        lines.push(`| ${cells.map(() => '---').join(' | ')} |`);
      }
    });
    return lines.length > 0 ? `\n\n${lines.join('\n')}\n\n` : '';
  },
});

/** Markdown -> raw HTML (marked, GFM). Not sanitized — always run through sanitizePostHtml before storing. */
export function markdownToHtml(markdown: string): string {
  return marked(markdown, { async: false, breaks: true, gfm: true });
}

/** Post.contentHtml -> Markdown for the editor. */
export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html ?? '');
}

const ALLOWED_TAGS = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
  'img',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'code',
  'pre',
  'hr',
  'br',
  'div',
  'span',
  'details',
  'summary',
];

/**
 * Strict HTML sanitizer for post bodies. Strips scripts, styles, event
 * handlers, and javascript: URLs; keeps editorial tags incl. tables, images,
 * links, and FAQ details/summary blocks.
 */
export function sanitizePostHtml(html: string): string {
  return sanitizeHtml(html ?? '', {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'rel'],
      img: ['src', 'alt', 'title', 'loading', 'width', 'height'],
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
      '*': ['id'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    transformTags: {
      // Harden stored links: drop target=..., force rel=noopener.
      a: (tagName, attribs) => {
        const next: Record<string, string> = { ...attribs, rel: 'noopener' };
        delete next.target;
        return { tagName, attribs: next };
      },
    },
  });
}

/** Full save pipeline: Markdown -> sanitized HTML ready for Post.contentHtml. */
export function markdownToSanitizedHtml(markdown: string): string {
  return sanitizePostHtml(markdownToHtml(markdown));
}

/** Plain text extracted from HTML (for search index / contentText). */
export function htmlToText(html: string): string {
  const text = sanitizeHtml(html ?? '', { allowedTags: [] });
  return text.replace(/\s+/g, ' ').trim();
}

export interface PostTextStats {
  wordCount: number;
  readingTimeMin: number;
  contentText: string;
}

/** Recomputed on every save: wordCount, readingTimeMin, contentText. */
export function postTextStats(sanitizedHtml: string): PostTextStats {
  const contentText = htmlToText(sanitizedHtml);
  const wordCount = contentText ? contentText.split(/\s+/).length : 0;
  return {
    wordCount,
    readingTimeMin: readingTimeMinutes(wordCount),
    contentText,
  };
}
