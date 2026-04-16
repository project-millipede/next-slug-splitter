/**
 * Generates artificial ballast files that simulate heavy third-party
 * dependencies.  Each file exports a `BALLAST_DATA` array of JSON objects
 * large enough to reach the configured target size.
 *
 * Run via `pnpm generate:ballast` — the generated files are git-ignored
 * and never committed.
 */

import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(__dirname, '..', 'lib', 'components');

// ---------------------------------------------------------------------------
// Ballast file specifications
//
// Each entry describes one ballast file to generate.
//   file      – Output filename (relative to components dir)
//   targetMB  – Approximate target file size in megabytes
//   comment   – Header comment describing what it simulates
// ---------------------------------------------------------------------------

const ballastFiles = [
  {
    file: 'counter-ballast.ts',
    targetMB: 1,
    comment: 'Auto-generated ballast data (~1 MB) — simulates a heavy dependency',
  },
  {
    file: 'chart-ballast.ts',
    targetMB: 3,
    comment: 'Auto-generated ballast data (~3 MB) — simulates a heavy visualization library',
  },
  {
    file: 'data-table-ballast.ts',
    targetMB: 6,
    comment: 'Auto-generated ballast data (~6 MB) — simulates a heavy data-grid library',
  },
];

// ---------------------------------------------------------------------------
// Entry generation helpers
//
// Each JSON entry is roughly ~160 bytes. The loop accumulates entries until
// the target size is reached.
// ---------------------------------------------------------------------------

const FILLER =
  'Simulated heavy dependency payload used to approximate realistic bundle sizes during development';

/** Produce a random object key like `item_m40fxnhqj8a`. */
function randomKey() {
  return 'item_' + Math.random().toString(36).slice(2);
}

/** Produce a random numeric string like `0.29685350`. */
function randomValue() {
  return Math.random().toFixed(8);
}

/** Serialize a single ballast entry as a JSON string fragment. */
function createEntry(id) {
  return JSON.stringify({ id, k: randomKey(), v: randomValue(), d: FILLER });
}

// ---------------------------------------------------------------------------
// File generation
// ---------------------------------------------------------------------------

/**
 * Build the full file content string from accumulated entries.
 * The output is a valid TypeScript module exporting a typed array literal.
 */
function buildFileContent(comment, entries) {
  return [
    `// ${comment}`,
    `export const BALLAST_DATA: Array<{ id: number; k: string; v: string; d: string }> = [${entries.join(',')}];`,
    '',
  ].join('\n');
}

/**
 * Generate a single ballast file on disk.
 * Skips generation when the file already exists — avoids unnecessary
 * regeneration on every dev restart.
 */
function generateBallastFile({ file, targetMB, comment }) {
  const outputPath = join(componentsDir, file);

  if (existsSync(outputPath)) {
    console.log(`[ballast] ${file} already exists, skipping.`);
    return;
  }

  // Accumulate entries until the target byte size is reached
  const targetBytes = targetMB * 1024 * 1024;
  const entries = [];
  let currentSize = 0;
  let id = 0;

  while (currentSize < targetBytes) {
    const entry = createEntry(id);
    entries.push(entry);
    currentSize += entry.length + 1; // +1 for the comma separator
    id++;
  }

  // Write the completed file
  const content = buildFileContent(comment, entries);
  writeFileSync(outputPath, content, 'utf-8');

  const actualMB = (Buffer.byteLength(content) / 1024 / 1024).toFixed(1);
  console.log(`[ballast] Generated ${file} — ${actualMB} MB (${id} entries)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

for (const spec of ballastFiles) {
  generateBallastFile(spec);
}
