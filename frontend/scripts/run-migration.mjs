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
const raw = match[1].trim();

// Parse manually instead of `new URL()` — the password may contain characters
// (e.g. `%`) that are not valid percent-escapes, which breaks the URL parser.
const withoutScheme = raw.replace(/^postgresql:\/\//, '');
const atIndex = withoutScheme.lastIndexOf('@');
const userinfo = withoutScheme.slice(0, atIndex);
const hostpart = withoutScheme.slice(atIndex + 1);
const colonIndex = userinfo.indexOf(':');
const user = userinfo.slice(0, colonIndex);
const password = userinfo.slice(colonIndex + 1);
const [hostAndPort, database] = hostpart.split('/');
const [host, port] = hostAndPort.split(':');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/run-migration.mjs <file.sql> [file2.sql ...]');
  process.exit(1);
}

const client = new pg.Client({
  host,
  port: Number(port) || 5432,
  user,
  password,
  database: database || 'postgres',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log(`Connected to ${host} as ${user}`);
  for (const file of files) {
    const sql = readFileSync(path.join(root, file), 'utf8');
    console.log(`\nRunning ${file}...`);
    try {
      await client.query(sql);
      console.log(`OK: ${file}`);
    } catch (err) {
      console.error(`FAILED: ${file}`);
      console.error(err.message);
      process.exitCode = 1;
      break;
    }
  }
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
