import { jsonLdScriptProps } from '@/lib/seo';

/** Render a JSON-LD structured-data script tag (XSS-escaped). */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script type="application/ld+json" {...jsonLdScriptProps(data)} />
  );
}
