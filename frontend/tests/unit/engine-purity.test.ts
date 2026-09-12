/**
 * Guards Phase 1 "engine isolation": src/engine/ must stay pure TypeScript —
 * no React, no Next, no fs, no sqlite, no imports reaching into
 * src/components or src/app.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ENGINE_DIR = path.resolve(__dirname, '../../src/engine');

const FORBIDDEN_PATTERNS: RegExp[] = [
  /from\s+['"]react['"]/,
  /from\s+['"]react-dom['"]/,
  /from\s+['"]next(\/|['"])/,
  /from\s+['"]fs['"]/,
  /from\s+['"]node:fs['"]/,
  /from\s+['"]better-sqlite3['"]/,
  /from\s+['"]@\/components/,
  /from\s+['"]@\/app/,
  /from\s+['"]\.\.\/components/,
  /from\s+['"]\.\.\/app/,
];

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) out.push(full);
  }
  return out;
}

describe('engine purity', () => {
  const files = listTsFiles(ENGINE_DIR);

  it('found at least one file under src/engine', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('no file under src/engine imports react, next, fs, better-sqlite3, or src/components|app', () => {
    const offenders: string[] = [];
    for (const file of files) {
      // Strip comments first so a doc comment that merely mentions a path
      // (e.g. explaining why a type is re-exported elsewhere) can't false-
      // positive as a real import statement.
      const raw = fs.readFileSync(file, 'utf-8');
      const content = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          offenders.push(`${path.relative(ENGINE_DIR, file)} matches ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
