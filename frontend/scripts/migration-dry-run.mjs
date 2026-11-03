/**
 * Rolled-back rehearsal of a migration plus its test script against the database in
 * `.env.local` (SUPABASE_DB_URL), production-ops workflow: nothing is ever committed.
 *
 *   node scripts/migration-dry-run.mjs <migration.sql> [<test.sql>]
 *
 * Runs everything in ONE transaction: the migration (its own begin/commit and `notify`
 * stripped), then the test script (its own begin/rollback stripped), then ROLLBACK. Prints
 * every `raise notice` (the tests' PASS lines). Exit 1 on any error.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const envText = readFileSync(path.join(root, '.env.local'), 'utf8');
const match = envText.match(/^SUPABASE_DB_URL=(.+)$/m);
if (!match) {
  console.error('SUPABASE_DB_URL not found in .env.local — see frontend/supabase/README.md.');
  process.exit(1);
}
// Same manual parse as run-migration.mjs (a password may hold an invalid %-escape).
const withoutScheme = match[1].trim().replace(/^postgresql:\/\//, '');
const atIndex = withoutScheme.lastIndexOf('@');
const userinfo = withoutScheme.slice(0, atIndex);
const [hostAndPort, database] = withoutScheme.slice(atIndex + 1).split('/');
const [host, port] = hostAndPort.split(':');
const colon = userinfo.indexOf(':');

const [migrationFile, testFile] = process.argv.slice(2);
if (!migrationFile) {
  console.error('Usage: node scripts/migration-dry-run.mjs <migration.sql> [<test.sql>]');
  process.exit(1);
}

const strip = (sql) => sql
  .replace(/^\s*begin\s*;\s*$/gim, '')
  .replace(/^\s*commit\s*;\s*$/gim, '')
  .replace(/^\s*rollback\s*;\s*$/gim, '')
  .replace(/^\s*notify\s+pgrst[^;]*;\s*$/gim, '');

const client = new pg.Client({
  host, port: Number(port) || 5432, user: userinfo.slice(0, colon), password: userinfo.slice(colon + 1),
  database: database || 'postgres', ssl: { rejectUnauthorized: false },
});
client.on('notice', (n) => console.log(`  ${n.message}`));

async function main() {
  await client.connect();
  console.log(`Connected to ${host} (dry run: everything is rolled back)`);
  await client.query('begin');
  try {
    console.log(`\nMigration ${migrationFile}`);
    await client.query(strip(readFileSync(path.join(root, migrationFile), 'utf8')));
    console.log('  applied inside the transaction');
    if (testFile) {
      console.log(`\nTests ${testFile}`);
      await client.query(strip(readFileSync(path.join(root, testFile), 'utf8')));
    }
    console.log('\nDRY RUN OK');
  } catch (err) {
    console.error(`\nDRY RUN FAILED: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.query('rollback');
    console.log('Rolled back.');
    await client.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
