// Prisma 7 configuration: connection URL lives here, NOT in schema.prisma.
// DATABASE_URL comes from the environment only — never hardcode it.

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Dummy fallback lets `prisma generate` run without a live DB;
    // migrate/seed always receive the real DATABASE_URL from the environment.
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/pawpilot',
  },
});
