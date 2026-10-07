import { ContactForm } from '@/components/ContactForm';
import { StaticPage, staticPageMetadata } from '@/components/StaticPage';

export const generateMetadata = () => staticPageMetadata('contact');

export default function ContactPage() {
  return (
    <StaticPage slug="contact">
      <section aria-labelledby="contact-form-heading" className="mt-10">
        <h2 id="contact-form-heading" className="text-2xl font-extrabold tracking-tight text-ink">
          Send us a message
        </h2>
        <div className="mt-4 rounded-2xl border border-ink/10 bg-white p-6 sm:p-8">
          <ContactForm />
        </div>
      </section>
    </StaticPage>
  );
}
