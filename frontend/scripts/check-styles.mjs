#!/usr/bin/env node
/**
 * Style gate: scan className literals for style violations.
 * Ref: docs/completed/plan_ui_foundation_2026-09-15.md, decision D4.
 *
 * Rules:
 * 1. Raw palette classes
 * 2. Arbitrary text size: text-[
 * 3. h-screen / min-h-screen
 * 4. pt-[
 * 5. Hex colour in className: #[0-9a-fA-F]{3,8}
 * 6. <button> tags (except src/components/ui/)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(frontendRoot, 'src');

// Parse CLI args
const args = process.argv.slice(2);
const summaryOnly = args.includes('--summary');
const ruleFilter = args.includes('--rule') ? args[args.indexOf('--rule') + 1] : null;

// Rule definitions
const rules = {
  'palette': {
    name: 'Raw palette classes',
    regex: /\b(bg|text|border|from|to|via|ring|fill|stroke|outline|decoration|divide|placeholder|accent|caret|shadow)-(stone|amber|yellow|orange|emerald|red|blue|teal|green|gray|neutral|zinc|slate|purple|violet|indigo|sky|cyan|lime|pink|rose|fuchsia)-(\d{2,3})(?:\/\d+)?\b/g,
  },
  'text-arbitrary': {
    name: 'Arbitrary text size',
    regex: /\btext-\[/g,
  },
  'h-screen': {
    name: 'h-screen / min-h-screen',
    regex: /\b(h-screen|min-h-screen)\b/g,
  },
  'pt-arbitrary': {
    name: 'pt-[',
    regex: /\bpt-\[/g,
  },
  'hex-color': {
    name: 'Hex colour in className',
    regex: /#[0-9a-fA-F]{3,8}\b/g,
  },
};

// Excluded paths
const excludedDirs = [
  'src/app/debug',
  'src/app/data',
  'src/app/test-ui',
  'src/app/admin',
  'src/app/deckbuilder-test',
  'src/app/pack-opener-preview',
];
const excludedFiles = ['src/components/cardColors.ts'];

function shouldExclude(filePath) {
  const relative = path.relative(frontendRoot, filePath).replace(/\\/g, '/');

  // Check excluded files
  if (excludedFiles.some(f => relative.endsWith(f))) {
    return true;
  }

  // Check excluded directories
  for (const dir of excludedDirs) {
    if (relative.startsWith(dir + '/')) {
      return true;
    }
  }

  return false;
}

function isInUiDir(filePath) {
  const relative = path.relative(frontendRoot, filePath).replace(/\\/g, '/');
  return relative.startsWith('src/components/ui/');
}

function walkDir(dir) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (item.isFile() && item.name.endsWith('.tsx')) {
      if (!shouldExclude(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function getLineNumber(content, index) {
  return content.substring(0, index).split('\n').length;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const violations = [];
  const isUiDir = isInUiDir(filePath);

  // Extract string literals, skipping import lines and comments
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // Skip import lines
    if (line.trim().startsWith('import ') && line.includes(' from ')) {
      continue;
    }

    // Skip comment lines
    if (line.trim().startsWith('//')) {
      continue;
    }

    // Process string literals in this line
    let i = 0;
    while (i < line.length) {
      // Double-quoted strings
      if (line[i] === '"') {
        i++;
        let str = '';
        while (i < line.length && line[i] !== '"') {
          if (line[i] === '\\') i++;
          str += line[i];
          i++;
        }
        if (line[i] === '"') i++;
        checkClassString(filePath, str, lineNum + 1, violations, isUiDir);
        continue;
      }

      // Single-quoted strings
      if (line[i] === "'") {
        i++;
        let str = '';
        while (i < line.length && line[i] !== "'") {
          if (line[i] === '\\') i++;
          str += line[i];
          i++;
        }
        if (line[i] === "'") i++;
        checkClassString(filePath, str, lineNum + 1, violations, isUiDir);
        continue;
      }

      // Backtick strings (template literals)
      if (line[i] === '`') {
        i++;
        let str = '';
        while (i < line.length && line[i] !== '`') {
          if (line[i] === '\\') i++;
          str += line[i];
          i++;
        }
        if (line[i] === '`') i++;
        checkClassString(filePath, str, lineNum + 1, violations, isUiDir);
        continue;
      }

      i++;
    }

  }

  // Check for <button tags (rule 6, skip if in ui dir)
  if (!isUiDir) {
    const buttonRegex = /<button/g;
    let match;
    const fullContent = fs.readFileSync(filePath, 'utf-8');
    while ((match = buttonRegex.exec(fullContent)) !== null) {
      const line = getLineNumber(fullContent, match.index);
      if (!ruleFilter || ruleFilter === 'button') {
        violations.push({
          line,
          rule: 'button',
          match: '<button',
        });
      }
    }
  }

  return violations;
}

function checkClassString(filePath, classStr, line, violations) {
  for (const [ruleKey, rule] of Object.entries(rules)) {
    if (ruleFilter && ruleFilter !== ruleKey) continue;

    // Reset regex lastIndex for global regexes
    rule.regex.lastIndex = 0;

    let match;
    while ((match = rule.regex.exec(classStr)) !== null) {
      violations.push({
        line,
        rule: ruleKey,
        match: match[0],
      });
    }
  }
}

function formatPath(filePath) {
  return path.relative(frontendRoot, filePath).replace(/\\/g, '/');
}

// Main execution
const componentsDir = path.join(srcRoot, 'components');
const appDir = path.join(srcRoot, 'app');

const files = [];
if (fs.existsSync(componentsDir)) {
  files.push(...walkDir(componentsDir));
}
if (fs.existsSync(appDir)) {
  files.push(...walkDir(appDir));
}

files.sort(); // Sort for consistent output

const allViolations = [];
const fileViolations = {};

for (const file of files) {
  const violations = checkFile(file);
  if (violations.length > 0) {
    fileViolations[file] = violations;
    allViolations.push(...violations.map(v => ({ ...v, file })));
  }
}

// Output violations (unless --summary only)
if (!summaryOnly) {
  for (const violation of allViolations) {
    const formattedPath = formatPath(violation.file);
    console.log(`${formattedPath}:${violation.line}  ${violation.rule}  ${violation.match}`);
  }
  if (allViolations.length > 0) {
    console.log('');
  }
}

// Output summary table
const fileEntries = Object.entries(fileViolations)
  .map(([file, violations]) => ({
    file: formatPath(file),
    count: violations.length,
  }))
  .sort((a, b) => b.count - a.count);

console.log('File summary:');
console.log('');
for (const entry of fileEntries) {
  console.log(`  ${entry.file}: ${entry.count}`);
}

const totalViolations = allViolations.length;
console.log('');
console.log(`Total violations: ${totalViolations}`);

process.exit(totalViolations > 0 ? 1 : 0);
