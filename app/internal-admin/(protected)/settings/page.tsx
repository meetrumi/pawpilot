// Admin site settings page.

import { SettingsForm } from '@/components/admin/settings-form';
import { requireSuperAdminPage } from '@/lib/auth';


export default async function AdminSettingsPage() {
  await requireSuperAdminPage();
  return <SettingsForm />;
}
