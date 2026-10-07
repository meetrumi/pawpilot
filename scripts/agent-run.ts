// PawPilot agent CLI. Registered as `npm run agent:run`.
// Usage: npx tsx scripts/agent-run.ts --job=agent|publish|refresh|guardian   (default: agent)
// Runs the same functions as the /api/cron/* routes and prints a JSON summary.

import { runDailyAgent, publishDuePosts, refreshOldPosts } from '../lib/agent/pipeline';
import { runSlotGuardian } from '../lib/agent/guardian';
import { db } from '../lib/db';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const job = arg('job') ?? 'agent';
  let summary: unknown;
  switch (job) {
    case 'agent':
      summary = await runDailyAgent('cli');
      break;
    case 'publish':
      summary = await publishDuePosts();
      break;
    case 'refresh':
      summary = await refreshOldPosts({ trigger: 'cli' });
      break;
    case 'guardian':
      summary = await runSlotGuardian();
      break;
    default:
      console.error(`unknown --job="${job}"; expected agent|publish|refresh|guardian`);
      process.exit(1);
  }
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
