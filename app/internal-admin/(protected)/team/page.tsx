// Team management page (super-admin only).

import { TeamManager } from '@/components/admin/team-manager';
import { requireSuperAdminPage } from '@/lib/auth';

export const metadata = {
  title: 'Team — PawPilot admin',
};

export default async function AdminTeamPage() {
  await requireSuperAdminPage();
  return <TeamManager />;
}
