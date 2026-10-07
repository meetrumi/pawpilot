// Admin categories manager page.

import { TaxonomyManager } from '@/components/admin/taxonomy-manager';


export default function AdminCategoriesPage() {
  return (
    <TaxonomyManager
      resource="categories"
      title="Categories"
      subtitle="Post categories. Deleting a category with posts is blocked."
      singular="Category"
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        {
          key: 'slug',
          label: 'Slug',
          type: 'text',
          hint: 'Leave empty to generate from the name. Must be unique.',
        },
        { key: 'description', label: 'Description', type: 'textarea', required: true },
      ]}
    />
  );
}
