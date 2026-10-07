// Admin topic queue page. Server wrapper loads categories for the manual-add form.

import { db } from '@/lib/db';
import { TopicsManager } from '@/components/admin/topics-manager';
import { requireSuperAdminPage } from '@/lib/auth';


export default async function AdminTopicsPage() {
  await requireSuperAdminPage();
  const categories = await db.category.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  return <TopicsManager categories={categories} />;
}
