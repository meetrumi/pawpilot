import { StaticPage, staticPageMetadata } from '@/components/StaticPage';

export const generateMetadata = () => staticPageMetadata('privacy');

export default function PrivacyPage() {
  return <StaticPage slug="privacy" />;
}
