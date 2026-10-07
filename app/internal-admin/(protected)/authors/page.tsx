// Admin authors manager page.

import { TaxonomyManager } from '@/components/admin/taxonomy-manager';


export default function AdminAuthorsPage() {
  return (
    <TaxonomyManager
      resource="authors"
      title="Authors"
      subtitle="Bylines shown on posts. Deleting an author with posts is blocked."
      singular="Author"
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        {
          key: 'slug',
          label: 'Slug',
          type: 'text',
          hint: 'Leave empty to generate from the name. Must be unique.',
        },
        { key: 'role', label: 'Role', type: 'text', defaultValue: 'Contributor' },
        { key: 'credentials', label: 'Credentials', type: 'text', hint: 'e.g. Certified Dog Trainer' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'avatarUrl', label: 'Avatar URL', type: 'url' },
        { key: 'bio', label: 'Bio', type: 'textarea', required: true },
      ]}
    />
  );
}
