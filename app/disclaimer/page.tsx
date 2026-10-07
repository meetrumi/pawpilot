import { StaticPage, staticPageMetadata } from '@/components/StaticPage';

export const generateMetadata = () => staticPageMetadata('disclaimer');

export default function DisclaimerPage() {
  return <StaticPage slug="disclaimer" />;
}
