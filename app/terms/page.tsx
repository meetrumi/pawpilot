import { StaticPage, staticPageMetadata } from '@/components/StaticPage';

export const generateMetadata = () => staticPageMetadata('terms');

export default function TermsPage() {
  return <StaticPage slug="terms" />;
}
