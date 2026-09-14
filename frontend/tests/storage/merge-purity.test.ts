/**
 * accounts_cloud_saves D4: `storage/merge.ts` must stay transport-agnostic — no
 * Supabase/Dexie/fetch imports — so the same merge logic still works if direct-to-Supabase
 * writes are ever replaced by a real backend API. Mirrors `tests/unit/engine-purity.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MERGE_FILE = path.resolve(__dirname, '../../src/storage/merge.ts');

const FORBIDDEN_PATTERNS: RegExp[] = [
  /from\s+['"]@supabase/,
  /from\s+['"]dexie['"]/,
  /\bfetch\s*\(/,
  /from\s+['"]react['"]/,
  /from\s+['"]next(\/|['"])/,
];

describe('storage/merge.ts purity', () => {
  it('exists', () => {
    expect(fs.existsSync(MERGE_FILE)).toBe(true);
  });

  it('imports no Supabase/Dexie/fetch/react/next', () => {
    const raw = fs.readFileSync(MERGE_FILE, 'utf-8');
    const content = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const offenders = FORBIDDEN_PATTERNS.filter((p) => p.test(content)).map(String);
    expect(offenders).toEqual([]);
  });
});
