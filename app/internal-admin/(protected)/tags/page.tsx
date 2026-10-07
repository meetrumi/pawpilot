// Admin tags manager page.

import { TaxonomyManager } from '@/components/admin/taxonomy-manager';
import { requireSuperAdminPage } from '@/lib/auth';


export default async function AdminTagsPage() {
  await requireSuperAdminPage();
  return (
    <TaxonomyManager
      resource="tags"
      title="Tags"
      subtitle="Post tags. New tags can also be created inline in the post editor."
      singular="Tag"
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        {
          key: 'slug',
          label: 'Slug',
          type: 'text',
          hint: 'Leave empty to generate from the name. Must be unique.',
        },
      ]}
    />
  );
}
