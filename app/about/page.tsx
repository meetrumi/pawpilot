import { StaticPage, staticPageMetadata } from '@/components/StaticPage';

export const generateMetadata = () => staticPageMetadata('about');

export default function AboutPage() {
  return <StaticPage slug="about" />;
}
