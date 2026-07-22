/**
 * Generates artificial ballast files that simulate heavy third-party
 * dependencies.  Each file exports a `BALLAST_DATA` array of JSON objects
 * large enough to reach the configured target size.
 *
 * Run via `pnpm generate:ballast` — the generated files are git-ignored
 * and never committed.
 */

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..', '..');
const componentsDir = join(packageRoot, 'src', 'ballast', 'generated');

// ---------------------------------------------------------------------------
// Ballast file specifications
//
// Each entry describes one ballast file to generate.
// ---------------------------------------------------------------------------

type BallastFileSpec = {
  /**
   * Output filename relative to the generated ballast directory.
   */
  file: string;
  /**
   * Approximate target file size in megabytes.
   */
  targetMB: number;
  /**
   * Header comment describing what the generated file simulates.
   */
  comment: string;
  /**
   * Stable seed used for deterministic pseudo-random values.
   */
  seed: string;
};

const ballastFiles: ReadonlyArray<BallastFileSpec> = [
  {
    file: 'example-preview-ballast.ts',
    targetMB: 1,
    comment:
      'Auto-generated ballast data (~1 MB) — simulates a heavy example preview dependency',
    seed: 'example-preview'
  },
  {
    file: 'flow-composer-ballast.ts',
    targetMB: 1,
    comment:
      'Auto-generated ballast data (~1 MB) — simulates a heavy flow composer dependency',
    seed: 'flow-composer'
  },
  {
    file: 'component-workbench-ballast.ts',
    targetMB: 2,
    comment:
      'Auto-generated ballast data (~2 MB) — simulates a heavy component workbench dependency',
    seed: 'component-workbench'
  }
];

// ---------------------------------------------------------------------------
// Entry generation helpers
//
// Each JSON entry is roughly ~160 bytes. The loop accumulates entries until
// the target size is reached.
// ---------------------------------------------------------------------------

const FILLER =
  'Simulated heavy dependency payload used to approximate realistic bundle sizes during development';

/**
 * Produce a deterministic numeric hash for generated ballast values.
 *
 * @param input Seed text for the hash.
 * @returns Unsigned 32-bit hash value.
 */
function hashString(input: string): number {
  let hash = 2166136261;

  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

/**
 * Produce a random-looking base36 token.
 *
 * @param seed Stable file seed.
 * @param id Ballast entry id.
 * @param field Field name to vary the token.
 * @returns Stable base36 token.
 */
function randomToken(seed: string, id: number, field: string): string {
  return hashString(`${seed}:${id}:${field}`).toString(36).padStart(7, '0');
}

/**
 * Produce a random object key like `item_m40fxnhqj8a`.
 *
 * @param seed Stable file seed.
 * @param id Ballast entry id.
 * @returns Stable random-looking object key.
 */
function randomKey(seed: string, id: number): string {
  return `item_${randomToken(seed, id, 'key')}`;
}

/**
 * Produce a random numeric string like `0.29685350`.
 *
 * @param seed Stable file seed.
 * @param id Ballast entry id.
 * @returns Stable random-looking numeric string.
 */
function randomValue(seed: string, id: number): string {
  return `0.${randomToken(seed, id, 'value')}`;
}

/**
 * Serialize a single ballast entry as a JSON string fragment.
 *
 * @param seed Stable file seed.
 * @param id Entry id inside the generated file.
 * @returns JSON object fragment for the generated array literal.
 */
function createEntry(seed: string, id: number): string {
  return JSON.stringify({
    id,
    key: randomKey(seed, id),
    value: randomValue(seed, id),
    payload: FILLER
  });
}

// ---------------------------------------------------------------------------
// File generation
// ---------------------------------------------------------------------------

/**
 * Build the full file content string from a generated data literal.
 * The output is a valid TypeScript module exporting a typed array literal.
 *
 * @param comment File header comment.
 * @param entries Serialized JSON entries.
 * @returns TypeScript source text.
 */
function buildFileContent(comment: string, entries: string[]): string {
  return [
    `// ${comment}`,
    `import type { BallastRecord } from '../types';`,
    '',
    `export const BALLAST_DATA: Array<BallastRecord> = [${entries.join(',')}];`,
    ''
  ].join('\n');
}

/**
 * Determine whether an existing generated file already matches the requested
 * generated ballast variant.
 *
 * @param outputPath Absolute generated ballast file path.
 * @param comment Header comment expected for the generated ballast variant.
 * @returns `true` when the existing file can be reused.
 */
function shouldReuseExistingBallastFile(
  outputPath: string,
  comment: string
): boolean {
  if (!existsSync(outputPath)) {
    return false;
  }

  const existingContent = readFileSync(outputPath, 'utf-8');

  return (
    existingContent.startsWith(`// ${comment}\n`) &&
    existingContent.includes('export const BALLAST_DATA: Array<BallastRecord>')
  );
}

/**
 * Generate a single ballast file on disk.
 * Skips generation when the file already exists with the current readable
 * field shape — avoids unnecessary regeneration on every dev restart while
 * still refreshing older `k`/`v`/`d` ballast files.
 *
 * @param spec Ballast file specification.
 * @returns Nothing. Writes the generated file to disk when needed.
 */
function generateBallastFile(spec: BallastFileSpec): void {
  const { file, targetMB, comment, seed } = spec;
  const outputPath = join(componentsDir, file);

  if (shouldReuseExistingBallastFile(outputPath, comment)) {
    console.log(`[ballast] ${file} already exists, skipping.`);
    return;
  }

  // Accumulate entries until the target byte size is reached
  const targetBytes = targetMB * 1024 * 1024;
  const entries: string[] = [];
  let currentSize = 0;
  let id = 0;

  while (currentSize < targetBytes) {
    const entry = createEntry(seed, id);
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
