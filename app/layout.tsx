import type { Metadata } from 'next';
import './globals.css';
// Admin post-editor styles (global CSS from node_modules must be imported in
// the root layout). Only affects .w-md-editor markup on /internal-admin pages.
import '@uiw/react-md-editor/markdown-editor.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { JsonLd } from '@/components/JsonLd';
import { jsonLdOrganization, jsonLdWebSite, siteUrl } from '@/lib/seo';

const url = siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: {
    default: 'PawPilot — Happy pets, confident owners.',
    template: '%s | PawPilot',
  },
  description:
    'Practical pet-care guides: dog training, cat care, breed guides, pet health basics, honest product reviews, and adventures with pets.',
  openGraph: {
    type: 'website',
    siteName: 'PawPilot',
    locale: 'en_US',
    images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PawPilot — Happy pets, confident owners.',
    description:
      'Practical pet-care guides: dog training, cat care, breed guides, pet health basics, honest product reviews, and adventures with pets.',
    images: ['/opengraph-image'],
  },
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-cream text-ink antialiased">
        <JsonLd data={jsonLdOrganization(url)} />
        <JsonLd data={jsonLdWebSite(url)} />
        <Header />
        <div id="main-content" className="flex-1">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
