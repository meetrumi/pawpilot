// Admin tags manager page.

import { TaxonomyManager } from '@/components/admin/taxonomy-manager';


export default function AdminTagsPage() {
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
