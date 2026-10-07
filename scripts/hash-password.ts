// Usage: npm run hash-password -- --password 'secret'
//        echo 'secret' | npm run hash-password
// Prints ONLY the bcrypt hash (12 rounds) to stdout. The password is never logged.

import bcrypt from 'bcryptjs';

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
    if (process.stdin.isTTY) {
      // No piped input and no --password flag: nothing to hash.
      resolve('');
    }
  });
}

async function main(): Promise<void> {
  let password = '';

  const flagIndex = process.argv.indexOf('--password');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    password = process.argv[flagIndex + 1];
  } else if (!process.stdin.isTTY) {
    password = await readStdin();
  }

  if (!password) {
    process.stderr.write('Error: no password provided. Use --password or pipe it via stdin.\n');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  process.stdout.write(hash + '\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
