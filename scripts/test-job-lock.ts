// Unit test for the job-lock TTL + heartbeat behavior in lib/agent/pipeline.ts.
// Uses the real Postgres test DB and the real lock functions.
//
// Run: DATABASE_URL=... npx tsx scripts/test-job-lock.ts
// Exits 0 on success, 1 on any assertion failure.

import { db } from '../lib/db';
import {
  claimJobLock,
  releaseJobLock,
  startLockHeartbeat,
  withJobLock,
} from '../lib/agent/pipeline';

let failures = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    failures++;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const JOB = 'test-lock';

  // 1. Claim succeeds; second claim while live fails (the 409 path).
  const ok1 = await claimJobLock(JOB, 'holder-A', 60_000);
  const ok2 = await claimJobLock(JOB, 'holder-B', 60_000);
  check('first claim succeeds', ok1 === true);
  check('second claim while live fails', ok2 === false);

  // 2. Only the holder can release.
  await releaseJobLock(JOB, 'holder-B');
  const stillLocked = await claimJobLock(JOB, 'holder-C', 60_000);
  check('wrong-holder release does not free the lock', stillLocked === false);
  await releaseJobLock(JOB, 'holder-A');
  const freed = await claimJobLock(JOB, 'holder-C', 60_000);
  check('holder release frees the lock', freed === true);
  await releaseJobLock(JOB, 'holder-C');

  // 3. A dead holder's lock expires after its TTL (simulates a Vercel
  //    timeout: the process dies, finally never runs, heartbeats stop).
  await claimJobLock(JOB, 'dead-holder', 1_500); // 1.5s TTL, no heartbeat
  await sleep(2_200);
  const afterDeath = await claimJobLock(JOB, 'next-runner', 60_000);
  check('dead holder lock expires after TTL', afterDeath === true);
  await releaseJobLock(JOB, 'next-runner');

  // 4. Heartbeat keeps a live job's lock alive past the base TTL.
  await claimJobLock(JOB, 'live-holder', 1_500);
  const hb = startLockHeartbeat(JOB, 'live-holder', 1_500);
  await sleep(3_000); // >2x the TTL — would have expired without heartbeats
  const contested = await claimJobLock(JOB, 'rival', 60_000);
  check('heartbeat keeps a live lock unclaimable', contested === false);
  clearInterval(hb);
  await releaseJobLock(JOB, 'live-holder');

  // 5. withJobLock runs fn, releases afterwards; concurrent withJobLock is rejected.
  let ran = false;
  const r1 = await withJobLock(JOB, 60_000, async () => {
    ran = true;
    const r2 = await withJobLock(JOB, 60_000, async () => 'should-not-run');
    check('nested/concurrent withJobLock is rejected', r2.claimed === false);
    return 'done';
  });
  check('withJobLock claims and runs fn', r1.claimed === true && r1.result === 'done' && ran);
  const r3 = await withJobLock(JOB, 60_000, async () => 'after-release');
  check('lock is released after withJobLock', r3.claimed === true && r3.result === 'after-release');

  // 6. withJobLock releases even when fn throws.
  await withJobLock(JOB, 60_000, async () => {
    throw new Error('boom');
  }).catch(() => {});
  const r4 = await withJobLock(JOB, 60_000, async () => 'recovered');
  check('lock is released when fn throws', r4.claimed === true);

  await db.jobLock.deleteMany({ where: { jobName: JOB } });

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll job-lock assertions passed.');
}

main()
  .catch((err) => {
    console.error('Test crashed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
